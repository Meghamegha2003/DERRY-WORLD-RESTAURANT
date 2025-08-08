const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Read the schema file
const schemaPath = path.join(__dirname, '..', 'models', 'orderSchema.js');
let schemaContent = fs.readFileSync(schemaPath, 'utf8');

// Update the status enum to include 'Cancellation Requested'
schemaContent = schemaContent.replace(
  "enum: ['Active', 'Cancelled', 'Returned', 'Return Requested', 'Return Approved', 'Return Rejected']",
  "enum: ['Active', 'Cancelled', 'Cancellation Requested', 'Returned', 'Return Requested', 'Return Approved', 'Return Rejected']"
);

// Save the updated schema
fs.writeFileSync(schemaPath, schemaContent, 'utf8');
console.log('Schema updated successfully!');
