const mongoose = require('mongoose');
const { Schema } = mongoose;

const OrderSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  items: [
    {
      product: { type: Schema.Types.ObjectId, ref: 'Product' },
      quantity: Number,
      price: Number,
    },
  ],
  totalAmount: { type: Number, required: true },
  address: { type: Object, required: true },
  paymentMethod: { type: String, required: true },
  status: {
    type: String,
    enum: ['Pending', 'Shipped', 'Completed', 'Cancelled'],  // Add your desired status values
    default: 'Pending',  // Default status when an order is created
  },
},
 { timestamps: true });

module.exports = mongoose.model('Order', OrderSchema);
