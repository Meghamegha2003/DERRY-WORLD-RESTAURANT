const busboy = require('busboy');

const parseMultipartData = (req, res, next) => {
  if (!req.headers['content-type'] || !req.headers['content-type'].includes('multipart/form-data')) {
    return next();
  }

  console.log('Parsing multipart data, content-type:', req.headers['content-type']);
  
  const bb = busboy({ headers: req.headers });
  const files = [];
  const fields = {};

  bb.on('file', (fieldname, file, info) => {
    const { filename, encoding, mimeType } = info;
    console.log('File detected:', { fieldname, filename, mimeType });
    const chunks = [];

    file.on('data', (data) => {
      chunks.push(data);
    });

    file.on('end', () => {
      const buffer = Buffer.concat(chunks);
      console.log('File processed:', { filename, size: buffer.length });
      files.push({
        fieldname,
        originalname: filename,
        encoding,
        mimetype: mimeType,
        buffer,
        size: buffer.length
      });
    });
  });

  bb.on('field', (fieldname, value) => {
    if (fields[fieldname]) {
      if (Array.isArray(fields[fieldname])) {
        fields[fieldname].push(value);
      } else {
        fields[fieldname] = [fields[fieldname], value];
      }
    } else {
      fields[fieldname] = value;
    }
  });

  bb.on('finish', () => {
    console.log('Busboy finished parsing:', { filesCount: files.length, fieldsCount: Object.keys(fields).length });
    req.files = files;
    req.body = fields;
    next();
  });

  bb.on('error', (err) => {
    console.error('Busboy error:', err);
    res.status(400).json({
      success: false,
      message: 'Error parsing form data'
    });
  });

  req.pipe(bb);
};

module.exports = { parseMultipartData };
