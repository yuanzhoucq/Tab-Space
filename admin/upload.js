const OSS = require('ali-oss')

const client = new OSS({
  bucket: process.env['TS_BUCKET'],
  region: process.env['TS_BUCKET_LOCATION'],
  accessKeyId: process.env['ALI_ACCESSKEY'],
  accessKeySecret: process.env['ALI_ACCESSSECRET'],
});

async function put () {
  try {
    let result1 = await client.put('tips.json', 'src/tips.json');
    let result2 = await client.put('notificationCount.json', 'src/notificationCount.json');
    console.log(result1, result2);
  } catch (e) {
    console.log(e);
  }
}

put();