const mongoose = require('mongoose');

const configKeySchema = new mongoose.Schema({
    projectId: { type: String, required: true }, 
    keyName: { type: String, required: true },   
    dataType: { type: String, enum: ['String', 'Number', 'Boolean', 'JSON'], required: true },

    defaultValue: { type: mongoose.Schema.Types.Mixed, required: true },

    targetingRules: {
        country: { type: String, default: null }, 
        countryValue: { type: mongoose.Schema.Types.Mixed }, 

        abTestEnabled: { type: Boolean, default: false },
        abTestPercentage: { type: Number, default: 50 }, 
        abTestVariantValue: { type: mongoose.Schema.Types.Mixed }, 
    },

    scheduledTime: { type: Date, default: null },

    lastUpdatedBy: { type: String, default: 'admin' },
    updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ConfigKey', configKeySchema);