const fs = require('fs');
const COS = require('cos-nodejs-sdk-v5');

const auth = {
    SecretId: process.env['COS_SECRETID'],
    SecretKey: process.env['COS_SECRETKEY']
  };
const options = {
Bucket: 'tab-space-1251731927',
Region: 'ap-shanghai',
};

const cos = new COS(auth);

cos.putObject({
    ...options,
    Key: 'tips.json',
    StorageClass: 'STANDARD',
    Body: fs.createReadStream('src/tips.json'),
    onProgress: function(progressData) {
        console.log(JSON.stringify(progressData));
    }
}, function(err, data) {
    console.log(err || data);
});