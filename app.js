const express =require("express");
const path=require("path");
const fs=require("fs");
const https = require("https");
const qs = require("querystring");
const app= express();
const bodyparser = require("body-parser");
const checksum_lib = require("./paytm/checksum");
const config = require("./paytm/config");
const mongoose = require('mongoose');
mongoose.connect('mongodb://localhost/charity', {useNewUrlParser: true});
const port= process.env.PORT||=90;

var charitySchema = new mongoose.Schema({
    name: String,
    phone:String,
    Email: String,
    amount: String,
});
var charity= mongoose.model('Charity', charitySchema)

const parseUrl = express.urlencoded({ extended: false });
const parseJson = express.json({ extended: false });

//express stuff
app.use('/static',express.static('static'))
app.use(express.urlencoded())
//pug stuff
app.set('view engine','pug')
app.set('views',path.join(__dirname,'views'))
//endpoint 
app.get('/',(req,res)=>{
    const params={"title":"my first pug","content":"my first backend and frontend site"}
    res.status(200).render("index.pug",params);
})
app.get("/contact", (req, res) => {
    res.sendFile(__dirname + "/views/index.html");
  });
  app.post("/paynow", [parseUrl, parseJson], (req, res) => {
    // Route for making payment
  
    var paymentDetails = {
      amount: req.body.amount,
      customerId: req.body.name,
      customerEmail: req.body.email,
      customerPhone: req.body.phone
    }
    if (!paymentDetails.amount || !paymentDetails.customerId || !paymentDetails.customerEmail || !paymentDetails.customerPhone) {
      res.status(400).send('Payment failed')
    } else {
      var myData = new charity(req.body);
      myData.save();
      var params = {};
      params['MID'] = config.PaytmConfig.mid;
      params['WEBSITE'] = config.PaytmConfig.website;
      params['CHANNEL_ID'] = 'WEB';
      params['INDUSTRY_TYPE_ID'] = 'Retail';
      params['ORDER_ID'] = 'TEST_' + new Date().getTime();
      params['CUST_ID'] = paymentDetails.customerId;
      params['TXN_AMOUNT'] = paymentDetails.amount;
      params['CALLBACK_URL'] = 'http://localhost:4000/callback';
      params['EMAIL'] = paymentDetails.customerEmail;
      params['MOBILE_NO'] = paymentDetails.customerPhone;
  
  
      checksum_lib.genchecksum(params, 'FL%MGbGkr3OqYCl7', function (err, checksum) {
        var txn_url = "https://securegw-stage.paytm.in/theia/processTransaction"; // for staging
        // var txn_url = "https://securegw.paytm.in/theia/processTransaction"; // for production
  
        var form_fields = "";
        for (var x in params) {
          form_fields += "<input type='hidden' name='" + x + "' value='" + params[x] + "' >";
        }
        form_fields += "<input type='hidden' name='CHECKSUMHASH' value='" + checksum + "' >";
  
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.write('<html><head><title>Merchant Checkout Page</title></head><body><center><h1>Please do not refresh this page...</h1></center><form method="post" action="' + txn_url + '" name="f1">' + form_fields + '</form><script type="text/javascript">document.f1.submit();</script></body></html>');
        res.end();
      });
    }
  });  
  app.post("/callback", (req, res) => {
    // Route for verifiying payment
  
    var body = '';
  
    req.on('data', function (data) {
      body += data;
    });
  
    req.on('end', function () {
      var html = "";
      var post_data = qs.parse(body);
  
      // received params in callback
      console.log('Callback Response: ', post_data, "\n");
  
  
      // verify the checksum
      var checksumhash = post_data.CHECKSUMHASH;
      // delete post_data.CHECKSUMHASH;
      var result = checksum_lib.verifychecksum(post_data, config.PaytmConfig.key, checksumhash);
      console.log("Checksum Result => ", result, "\n");
  
  
      // Send Server-to-Server request to verify Order Status
      var params = { "MID": config.PaytmConfig.mid, "ORDERID": post_data.ORDERID };
  
      checksum_lib.genchecksum(params, config.PaytmConfig.key, function (err, checksum) {
  
        params.CHECKSUMHASH = checksum;
        post_data = 'JsonData=' + JSON.stringify(params);
  
        var options = {
          hostname: 'securegw-stage.paytm.in', // for staging
          // hostname: 'securegw.paytm.in', // for production
          port: 443,
          path: '/merchant-status/getTxnStatus',
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': post_data.length
          }
        };
  
  
        // Set up the request
        var response = "";
        var post_req = https.request(options, function (post_res) {
          post_res.on('data', function (chunk) {
            response += chunk;
          });
  
          post_res.on('end', function () {
            console.log('S2S Response: ', response, "\n");
  
            var _result = JSON.parse(response);
            if (_result.STATUS == 'TXN_SUCCESS') {
              res.send('payment sucess')
            } else {
              res.send('payment failed')
            }
          });
        });
  
        // post the data
        post_req.write(post_data);
        post_req.end();
      });
    });
  });

//server 
app.listen(port,()=>{
    console.log(`sucesfully port ${port}`)
}
)