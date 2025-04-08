require("./entsoe-api");
const fs = require("fs");

const {
  entsoeKey,
  accountSid,
  authToken,
  contentSid,
  senderPhoneNumber,
  ownerPhoneNumber,
  priceLimit,
  users,
} = require("./config");

const client = require("twilio")(accountSid, authToken);
const entsoeApi = new ENTSOEapi(entsoeKey);

function formatIntervals(negativeIntervals, priceLimit) {
  let formattedIntervals = "";
  formattedIntervals += negativeIntervals
    .filter((interval) => interval.price < priceLimit)
    .map((interval) => {
      return `Van ${interval.hour} tot ${interval.hour + 1} : €${interval.price
        .toPrecision(3)
        .replace(/0+$/, "")}`;
    })
    .join(", ");

  return formattedIntervals;
}

function sendMessage(recipientNumber, contentVariables) {
  console.log(contentVariables);
  client.messages
    .create({
      contentSid,
      from: senderPhoneNumber,
      to: recipientNumber,
      contentVariables: JSON.stringify(contentVariables),
    })
    .then((message) => console.log(message.sid))
    .catch((err) => console.log(err));
}

function messageUsers(parameters) {
  const ownerVariables = {
    1: "Willem",
    2: String(parameters.priceLimit),
    3: formatIntervals(parameters.negativeIntervals, parameters.priceLimit),
  };
  sendMessage(ownerPhoneNumber, ownerVariables);

  for (const userPhoneNumber in users) {
    let user = users[userPhoneNumber];
    let priceLimit = user.priceLimit || parameters.priceLimit;
    const variables = {
      1: user.name,
      2: String(priceLimit),
      3: formatIntervals(parameters.negativeIntervals, priceLimit),
    };

    if (variables[3] === "") continue;

    sendMessage(userPhoneNumber, variables);
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
    let errorVariables = {
      1: "Willem",
      2: "0",
      3: ("Error when sending price notifications: " + e).replaceAll("'", ""),
    };
    console.log(e);
    sendMessage(ownerPhoneNumber, errorVariables);
  }
}

main();
