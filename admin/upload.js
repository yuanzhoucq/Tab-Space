const OSS = require('ali-oss')

const client = new OSS({
  bucket: process.env['TS_BUCKET'],
  region: process.env['TS_BUCKET_LOCATION'],
  accessKeyId: process.env['ALI_ACCESSKEY'],
  accessKeySecret: process.env['ALI_ACCESSSECRET'],
});

async function put () {
  try {
    let result = await client.put('tips.json', 'src/tips.json');
    console.log(result);
  } catch (e) {
    console.log(e);
  }
}

put();