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
  sendMessage(ownerPhoneNumber, ownerMessage);

  for (const userPhoneNumber in users) {
    const message = formatMessage(messageFormat, {
      ...parameters,
      ...users[userPhoneNumber],
    });

    console.log(message);
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

  return new Promise((resolve) => {
    entsoeApi.getData(query, function (data) {
      var ret = JSON.parse(ENTSOEapi.parseData(data));
      let series = ret.Publication_MarketDocument.TimeSeries;
      if (Array.isArray(series)) series = series[0];
      resolve(series.Period.Point);
    });
  });
}

getPriceData().then((dataPoints) => {
  let negativeIntervals = [];

  let addInterval = (hour, price) => {
    negativeIntervals.push(
      `Van ${hour} tot ${hour + 1} : €${price
        .toPrecision(3)
        .replace(/0+$/, "")}`
    );
  };

  for (const point of dataPoints) {
    const hour = point.position - 1;

    if (hour < 7) continue;
    if (hour > 19) break;
    const price = Number(point["price.amount"]) / 1000;

    if (price < priceLimit) addInterval(hour, price);
  }

  if (negativeIntervals.length == 0) {
    console.log("Price will be above limit for the entire day");
    return;
  }

  const parameters = {
    date: new Date().toLocaleDateString("nl-NL"),
    priceLimit,
    negativeIntervals: negativeIntervals.join(", "),
  };

  messageUsers(parameters);
});
