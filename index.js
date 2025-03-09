require("./entsoe-api");
const fs = require("fs");

const {
  entsoeKey,
  accountSid,
  authToken,
  senderPhoneNumber,
  ownerPhoneNumber,
  priceLimit,
  users,
} = require("./config");
const messageFormat = fs.readFileSync("./messageFormat.txt").toString();

const client = require("twilio")(accountSid, authToken);
const entsoeApi = new ENTSOEapi(entsoeKey);

function formatMessage(formatString, parameters) {
  if (parameters.formattedMessage === undefined)
    parameters.formattedMessage = "";

  parameters.formattedMessage += parameters.negativeIntervals
    .filter((interval) => interval.price < parameters.priceLimit)
    .map((interval) => {
      return `Van ${interval.hour} tot ${interval.hour + 1} : €${interval.price
        .toPrecision(3)
        .replace(/0+$/, "")}`;
    })
    .join(", ");

  if (parameters.formattedMessage === "") return "";

  let result = formatString;
  for (const value in parameters) {
    result = result.replace(`{${value}}`, parameters[value]);
  }
  return result;
}

function sendMessage(recipientNumber, message) {
  client.messages
    .create({ body: message, from: senderPhoneNumber, to: recipientNumber })
    .then((message) => console.log(message.sid))
    .catch((err) => console.log(err));
}

function messageUsers(parameters) {
  const ownerMessage = formatMessage(messageFormat, {
    ...parameters,
    name: "Willem",
  });
  console.log(ownerMessage);

  sendMessage(ownerPhoneNumber, ownerMessage);

  for (const userPhoneNumber in users) {
    const message = formatMessage(messageFormat, {
      ...parameters,
      ...users[userPhoneNumber],
    });

    if (message === "") continue;

    sendMessage(userPhoneNumber, message);
  }
}

function getPriceData() {
  const periodStart = new Date();
  const periodEnd = new Date();
  periodEnd.setDate(periodEnd.getDate() + 1);

  const query = {
    documentType: "A44",
    in_Domain: "10YNL----------L",
    out_Domain: "10YNL----------L",
    periodStart: ENTSOEapi.buildPeriod(periodStart),
    periodEnd: ENTSOEapi.buildPeriod(periodEnd),
  };

  return new Promise((resolve, reject) => {
    try {
      entsoeApi.getData(query, function (data) {
        try {
          var ret = JSON.parse(ENTSOEapi.parseData(data));
          let series = ret.Publication_MarketDocument.TimeSeries;
          if (Array.isArray(series)) series = series[0];
          resolve(series.Period.Point);
        } catch (e) {
          reject(e);
        }
      });
    } catch (e) {
      reject(e);
    }
  });
}

async function main() {
  try {
    let dataPoints = await getPriceData();
    let negativeIntervals = [];

    for (const point of dataPoints) {
      const hour = Number(point.position._text) - 1;

      if (hour < 7) continue;
      if (hour > 19) break;
      const price = Number(point["price.amount"]._text) / 1000;

      if (price < priceLimit) negativeIntervals.push({ hour, price });
    }

    if (negativeIntervals.length == 0) {
      console.log("Price will be above limit for the entire day");
      return;
    }

    const parameters = {
      date: new Date().toLocaleDateString("nl-NL"),
      priceLimit,
      negativeIntervals,
    };

    messageUsers(parameters);
  } catch (e) {
    const errorMessage = formatMessage(messageFormat, {
      date: new Date().toLocaleDateString("nl-NL"),
      priceLimit: 0,
      formattedMessage: "Error when sending price notifications: " + e,
      negativeIntervals: [],
      name: "Willem",
    });
    console.log(errorMessage);
    sendMessage(ownerPhoneNumber, errorMessage);
  }
}

main();
