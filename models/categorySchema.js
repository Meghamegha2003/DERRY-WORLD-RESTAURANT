const mongoose = require('mongoose');
const { Schema } = mongoose;


const categorySchema=new Schema({
    name:{
        type: String,
    required: true,
    unique: true, 
    trim: true,
    },
    isActive: {
        type: Boolean,
        default: true,
      },
      description:{
        type: String,
    default: '',
    },
    isListed:{
        type:Boolean,
        default:true
    },
    categoryOffer:{
        type:Number,
        default:0
    },
    createdAt:{
        type:Date,
        default:Date.now
    }
})

const Category = mongoose.model('Category', categorySchema);
module.exports=Category;