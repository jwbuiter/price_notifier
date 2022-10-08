require("entsoe-api");

const {
  entsoeKey,
  accountSid,
  authToken,
  senderPhoneNumber,
  ownerPhoneNumber,
  priceLimit,
  messageFormat,
  users,
} = require("./config");

const client = require("twilio")(accountSid, authToken);
const entsoeApi = new ENTSOEapi(entsoeKey);

function formatMessage(formatString, parameters) {
  let result = formatString;
  for (const value in parameters) {
    result = result.replace(`{${value}}`, parameters[value]);
  }
  return result;
}

function messageOwner(message) {
  client.messages
    .create({ body: message, from: senderPhoneNumber, to: ownerPhoneNumber })
    .then((message) => console.log(message.sid));
}

function messageUsers(parameters) {
  for (const userPhoneNumber in users) {
    const message = formatMessage(messageFormat, {
      ...parameters,
      ...users[userPhoneNumber],
    });
    console.log(message);

    client.messages.create({
      body: message,
      from: senderPhoneNumber,
      to: userPhoneNumber,
    });

    // messageOwner(message);
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
  let currentInterval = null;

  let startInterval = (hour) => {
    if (currentInterval !== null) return;
    currentInterval = hour;
  };

  let endInterval = (hour) => {
    if (currentInterval === null) return;
    negativeIntervals.push(`${currentInterval}:00-${hour}:00`);
    currentInterval = null;
  };

  for (const point of dataPoints) {
    const hour = point.position - 1;
    const price = Number(point["price.amount"]) / 1000;

    if (price < priceLimit) startInterval(hour);
    else endInterval(hour);
  }

  if (negativeIntervals.length == 0) return;

  const parameters = {
    date: new Date().toLocaleDateString("nl-NL"),
    priceLimit,
    negativeIntervals: negativeIntervals.join(", "),
  };

  messageUsers(parameters);
});
