require('dotenv').config();

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const compression = require('compression');

const app = express();

app.use(compression());
app.use(cors());
app.use(express.json());

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/smart_remote_config';
const PORT = process.env.PORT || 3001;
const ANALYTICS_TIMEZONE = 'Asia/Jerusalem';

mongoose
    .connect(MONGODB_URI)
    .then(() => console.log('Connected to MongoDB Successfully!'))
    .catch(err => console.error('Failed to connect to MongoDB:', err));

const configSchema = new mongoose.Schema({
    projectId: { type: String, required: true },
    keyName: { type: String, required: true },
    dataType: { type: String, required: true },
    defaultValue: mongoose.Schema.Types.Mixed,
    targetingRules: {
        country: { type: String, default: null },
        countryValue: mongoose.Schema.Types.Mixed,
        abTestEnabled: { type: Boolean, default: false },
        abTestPercentage: { type: Number, default: 50 },
        abTestVariantValue: mongoose.Schema.Types.Mixed
    },
    scheduledTime: { type: String, default: null }
});

configSchema.index({ projectId: 1, keyName: 1 });

const ConfigModel = mongoose.model('Config', configSchema);

const analyticsSchema = new mongoose.Schema({
    projectId: { type: String, required: true },
    elementId: { type: String, required: true },
    variantValue: { type: String, required: true },
    clickCount: { type: Number, default: 0 },
    lastClicked: { type: Date, default: Date.now }
});

analyticsSchema.index(
    { projectId: 1, elementId: 1, variantValue: 1 },
    { unique: true }
);

analyticsSchema.index({ projectId: 1, lastClicked: -1 });

const AnalyticsModel = mongoose.model('Analytics', analyticsSchema);

const dailyAnalyticsSchema = new mongoose.Schema({
    projectId: { type: String, required: true },
    elementId: { type: String, required: true },
    variantValue: { type: String, required: true },
    dateKey: { type: String, required: true },
    clickCount: { type: Number, default: 0 },
    updatedAt: { type: Date, default: Date.now }
});

dailyAnalyticsSchema.index(
    { projectId: 1, elementId: 1, variantValue: 1, dateKey: 1 },
    { unique: true }
);

dailyAnalyticsSchema.index({
    projectId: 1,
    dateKey: 1,
    elementId: 1,
    variantValue: 1
});

const DailyAnalyticsModel = mongoose.model('DailyAnalytics', dailyAnalyticsSchema);

const deviceSyncSchema = new mongoose.Schema({
    projectId: { type: String, required: true },
    deviceId: { type: String, required: true },
    country: { type: String, default: 'Unknown' },
    abGroups: { type: Object, default: {} },
    lastSync: { type: Date, default: Date.now }
});

deviceSyncSchema.index(
    { projectId: 1, deviceId: 1 },
    { unique: true }
);

deviceSyncSchema.index({ projectId: 1, lastSync: -1 });

const DeviceSyncModel = mongoose.model('DeviceSync', deviceSyncSchema);

const auditLogSchema = new mongoose.Schema({
    projectId: { type: String, required: true },
    action: { type: String, required: true },
    keyName: { type: String, required: true },
    changes: { type: String, required: true },
    previousValue: mongoose.Schema.Types.Mixed,
    dataType: { type: String, required: true },
    user: { type: String, default: 'Admin' },
    timestamp: { type: Date, default: Date.now }
});

auditLogSchema.index({ projectId: 1, timestamp: -1 });

const AuditLogModel = mongoose.model('AuditLog', auditLogSchema);

mongoose.connection.once('open', async () => {
    try {
        await Promise.all([
            ConfigModel.createIndexes(),
            AnalyticsModel.createIndexes(),
            DailyAnalyticsModel.createIndexes(),
            DeviceSyncModel.createIndexes(),
            AuditLogModel.createIndexes()
        ]);

        console.log('MongoDB indexes are ready');
    } catch (error) {
        console.error('Failed to create indexes:', error);
    }
});

const serverCache = {};
const syncDevicesBuffer = new Map();

function getDateKey(date = new Date(), timeZone = ANALYTICS_TIMEZONE) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(date);

    const values = Object.fromEntries(
        parts.map(part => [part.type, part.value])
    );

    return `${values.year}-${values.month}-${values.day}`;
}

function normalizeVariantValue(value) {
    if (value === undefined || value === null) {
        return '';
    }

    return String(value);
}

setInterval(async () => {
    if (syncDevicesBuffer.size === 0) return;

    const devicesToSync = Array.from(syncDevicesBuffer.values());
    syncDevicesBuffer.clear();

    const operations = devicesToSync.map(data => ({
        updateOne: {
            filter: {
                projectId: data.projectId,
                deviceId: data.deviceId
            },
            update: {
                $set: {
                    lastSync: data.lastSync,
                    country: data.country,
                    abGroups: data.abGroups
                }
            },
            upsert: true
        }
    }));

    try {
        await DeviceSyncModel.bulkWrite(operations);
    } catch (err) {
        console.error('Error flushing devices:', err);
    }
}, 10000);

setInterval(() => {
    const now = Date.now();
    const twentyFourHours = 24 * 60 * 60 * 1000;

    for (const projectId in serverCache) {
        if (now - serverCache[projectId].lastAccessed > twentyFourHours) {
            delete serverCache[projectId];
            console.log(`[Cache] Cleared projectId: ${projectId}`);
        }
    }
}, 60 * 60 * 1000);

app.get('/api/v1/config', async (req, res) => {
    const { apiKey, country, deviceId } = req.query;
    const projectId = apiKey;

    if (!projectId) {
        return res.json({ configs: {} });
    }

    if (!serverCache[projectId]) {
        try {
            const dbConfigs = await ConfigModel.find({ projectId }).lean();

            serverCache[projectId] = {
                configs: dbConfigs,
                lastAccessed: Date.now()
            };
        } catch (error) {
            console.error('Error loading configs:', error);
            return res.status(500).json({ configs: {} });
        }
    } else {
        serverCache[projectId].lastAccessed = Date.now();
    }

    const projectConfigs = serverCache[projectId].configs;
    const finalConfig = {};
    const assignedAbGroups = {};
    const now = new Date();

    projectConfigs.forEach(conf => {
        if (conf.scheduledTime && new Date(conf.scheduledTime) > now) {
            return;
        }

        let selectedValue = conf.defaultValue;

        if (conf.targetingRules?.country === country) {
            selectedValue = conf.targetingRules.countryValue;
        }

        if (conf.targetingRules?.abTestEnabled) {
            const pseudoRandom = parseInt(deviceId || '0', 36) % 100;

            if (pseudoRandom < conf.targetingRules.abTestPercentage) {
                selectedValue = conf.targetingRules.abTestVariantValue;
                assignedAbGroups[conf.keyName] = 'Variant B (Test Group)';
            } else {
                assignedAbGroups[conf.keyName] = 'Variant A (Control Group)';
            }
        }

        finalConfig[conf.keyName] = selectedValue;
    });

    if (deviceId) {
        syncDevicesBuffer.set(deviceId, {
            projectId,
            deviceId,
            country: country || 'Unknown',
            abGroups: assignedAbGroups,
            lastSync: new Date()
        });
    }

    res.json({ configs: finalConfig });
});


app.post('/api/config/update', async (req, res) => {
    const { configsToSave } = req.body;

    if (!configsToSave || configsToSave.length === 0) {
        return res.status(400).json({ success: false });
    }

    const projectId = configsToSave[0].projectId;

    try {
        const oldConfigs = await ConfigModel.find({ projectId }).lean();
        const oldConfigMap = {};

        oldConfigs.forEach(c => {
            oldConfigMap[c.keyName] = c;
        });

        const operations = [];
        const logsToInsert = [];

        configsToSave.forEach(conf => {
            const old = oldConfigMap[conf.keyName];

            const cleanOldTargeting = old && old.targetingRules
                ? { ...old.targetingRules }
                : {};

            delete cleanOldTargeting._id;

            const isDefaultChanged = !old || String(old.defaultValue) !== String(conf.defaultValue);
            const isTargetingChanged = !old || JSON.stringify(cleanOldTargeting) !== JSON.stringify(conf.targetingRules || {});

            if (isDefaultChanged || isTargetingChanged) {
                logsToInsert.push({
                    projectId: conf.projectId,
                    action: old ? 'Updated Rule' : 'New Rule',
                    keyName: conf.keyName,
                    changes: isTargetingChanged
                        ? 'Updated Targeting / A/B Test / Schedule rules'
                        : `Changed value to [${conf.defaultValue}]`,
                    previousValue: old ? old.defaultValue : null,
                    dataType: conf.dataType,
                    user: 'Admin'
                });
            }

            operations.push({
                updateOne: {
                    filter: {
                        projectId: conf.projectId,
                        keyName: conf.keyName
                    },
                    update: {
                        $set: {
                            defaultValue: conf.defaultValue,
                            dataType: conf.dataType,
                            targetingRules: conf.targetingRules,
                            scheduledTime: conf.scheduledTime
                        }
                    },
                    upsert: true
                }
            });
        });

        await ConfigModel.bulkWrite(operations);

        if (logsToInsert.length > 0) {
            await AuditLogModel.insertMany(logsToInsert);
        }

        delete serverCache[projectId];

        res.json({
            success: true,
            message: 'Published successfully'
        });
    } catch (error) {
        console.error('Update Error:', error);

        res.status(500).json({
            success: false,
            message: 'Failed to update Database'
        });
    }
});

app.get('/api/config/portal/:projectId', async (req, res) => {
    try {
        const { projectId } = req.params;
        const configs = await ConfigModel.find({ projectId });

        res.json({
            success: true,
            configs
        });
    } catch (error) {
        console.error('Portal configs error:', error);

        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

app.post('/api/config/auto-register', async (req, res) => {
    try {
        const { projectId, elements } = req.body;

        if (!projectId || !elements || !Array.isArray(elements)) {
            return res.status(400).json({ success: false });
        }

        const operations = [];

        for (const el of elements) {
            const { id, text, bgColor, textColor, textSize, isVisible } = el;

            if (text !== undefined) {
                operations.push({
                    updateOne: {
                        filter: {
                            projectId,
                            keyName: `${id}_text`
                        },
                        update: {
                            $setOnInsert: {
                                projectId,
                                keyName: `${id}_text`,
                                dataType: 'String',
                                defaultValue: text
                            }
                        },
                        upsert: true
                    }
                });
            }

            if (bgColor !== undefined) {
                operations.push({
                    updateOne: {
                        filter: {
                            projectId,
                            keyName: `${id}_bgColor`
                        },
                        update: {
                            $setOnInsert: {
                                projectId,
                                keyName: `${id}_bgColor`,
                                dataType: 'String',
                                defaultValue: bgColor
                            }
                        },
                        upsert: true
                    }
                });
            }

            if (textColor !== undefined) {
                operations.push({
                    updateOne: {
                        filter: {
                            projectId,
                            keyName: `${id}_textColor`
                        },
                        update: {
                            $setOnInsert: {
                                projectId,
                                keyName: `${id}_textColor`,
                                dataType: 'String',
                                defaultValue: textColor
                            }
                        },
                        upsert: true
                    }
                });
            }

            if (textSize !== undefined) {
                operations.push({
                    updateOne: {
                        filter: {
                            projectId,
                            keyName: `${id}_textSize`
                        },
                        update: {
                            $setOnInsert: {
                                projectId,
                                keyName: `${id}_textSize`,
                                dataType: 'Number',
                                defaultValue: textSize
                            }
                        },
                        upsert: true
                    }
                });
            }

            if (isVisible !== undefined) {
                operations.push({
                    updateOne: {
                        filter: {
                            projectId,
                            keyName: `${id}_isVisible`
                        },
                        update: {
                            $setOnInsert: {
                                projectId,
                                keyName: `${id}_isVisible`,
                                dataType: 'Boolean',
                                defaultValue: isVisible
                            }
                        },
                        upsert: true
                    }
                });
            }
        }

        if (operations.length > 0) {
            await ConfigModel.bulkWrite(operations);
            delete serverCache[projectId];
        }

        res.json({
            success: true,
            message: 'Auto-registration complete'
        });
    } catch (error) {
        console.error('Auto register error:', error);

        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

app.delete('/api/config', async (req, res) => {
    try {
        const { projectId, keyName } = req.body;

        await ConfigModel.deleteOne({
            projectId,
            keyName
        });

        delete serverCache[projectId];

        res.json({
            success: true,
            message: 'Deleted successfully'
        });
    } catch (error) {
        console.error('Delete config error:', error);

        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

app.post('/api/analytics/click', async (req, res) => {
    try {
        const { projectId, elementId, variantValue } = req.body;

        if (!projectId || !elementId || variantValue === undefined || variantValue === null) {
            return res.status(400).json({ success: false });
        }

        const now = new Date();
        const normalizedVariantValue = normalizeVariantValue(variantValue);
        const dateKey = getDateKey(now);

        await Promise.all([
            AnalyticsModel.updateOne(
                {
                    projectId,
                    elementId,
                    variantValue: normalizedVariantValue
                },
                {
                    $inc: { clickCount: 1 },
                    $set: { lastClicked: now }
                },
                { upsert: true }
            ),

            DailyAnalyticsModel.updateOne(
                {
                    projectId,
                    elementId,
                    variantValue: normalizedVariantValue,
                    dateKey
                },
                {
                    $inc: { clickCount: 1 },
                    $set: { updatedAt: now }
                },
                { upsert: true }
            )
        ]);

        res.json({
            success: true,
            message: 'Click tracked successfully'
        });
    } catch (error) {
        console.error('Click tracking error:', error);

        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

app.get('/api/analytics/:projectId', async (req, res) => {
    try {
        const { projectId } = req.params;
        const analytics = await AnalyticsModel.find({ projectId }).sort({ lastClicked: -1 });

        res.json({
            success: true,
            analytics
        });
    } catch (error) {
        console.error('Analytics fetch error:', error);

        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

app.get('/api/health/:projectId', async (req, res) => {
    try {
        const { projectId } = req.params;

        const now = new Date();
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
        const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        const latestLog = await AuditLogModel.findOne({ projectId }).sort({ timestamp: -1 });
        const lastUpdateTime = latestLog ? latestLog.timestamp : new Date(0);

        const [
            totalDevices,
            syncedLastHour,
            syncedLast24Hours,
            syncedSinceLastUpdate
        ] = await Promise.all([
            DeviceSyncModel.countDocuments({ projectId }),
            DeviceSyncModel.countDocuments({
                projectId,
                lastSync: { $gte: oneHourAgo }
            }),
            DeviceSyncModel.countDocuments({
                projectId,
                lastSync: { $gte: twentyFourHoursAgo }
            }),
            DeviceSyncModel.countDocuments({
                projectId,
                lastSync: { $gte: lastUpdateTime }
            })
        ]);

        res.json({
            success: true,
            health: {
                totalDevices,
                syncedLastHour,
                syncedLast24Hours,
                syncedSinceLastUpdate
            }
        });
    } catch (error) {
        console.error('Error fetching health stats:', error);

        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

app.post('/api/logs', async (req, res) => {
    try {
        const {
            projectId,
            action,
            keyName,
            changes,
            previousValue,
            dataType,
            user
        } = req.body;

        if (!projectId) {
            return res.status(400).json({ success: false });
        }

        await AuditLogModel.create({
            projectId,
            action,
            keyName,
            changes,
            previousValue,
            dataType,
            user
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Create log error:', error);
        res.status(500).json({ success: false });
    }
});

app.get('/api/logs/:projectId', async (req, res) => {
    try {
        const { projectId } = req.params;
        const logs = await AuditLogModel.find({ projectId }).sort({ timestamp: -1 });

        res.json({
            success: true,
            logs
        });
    } catch (error) {
        console.error('Logs fetch error:', error);
        res.status(500).json({ success: false });
    }
});

app.post('/api/config/rollback', async (req, res) => {
    try {
        const { logId } = req.body;

        const logEntry = await AuditLogModel.findById(logId);

        if (!logEntry) {
            return res.status(404).json({
                success: false,
                message: 'Log entry not found'
            });
        }

        const {
            projectId,
            keyName,
            previousValue,
            dataType
        } = logEntry;

        if (previousValue === undefined || previousValue === null) {
            return res.status(400).json({
                success: false,
                message: 'This action cannot be rolled back'
            });
        }

        await ConfigModel.updateOne(
            {
                projectId,
                keyName
            },
            {
                $set: {
                    defaultValue: previousValue,
                    dataType
                }
            },
            { upsert: true }
        );

        delete serverCache[projectId];

        await AuditLogModel.create({
            projectId,
            action: 'Rollback Applied',
            keyName,
            changes: `Restored to value: [${previousValue}]`,
            dataType,
            user: 'System'
        });

        res.json({
            success: true,
            message: 'Rollback applied successfully'
        });
    } catch (error) {
        console.error('Rollback error:', error);

        res.status(500).json({
            success: false,
            message: 'Server error during rollback'
        });
    }
});

app.get('/api/devices/:projectId', async (req, res) => {
    try {
        const { projectId } = req.params;
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

        const devices = await DeviceSyncModel.find({
            projectId,
            lastSync: { $gte: twentyFourHoursAgo }
        }).sort({ lastSync: -1 });

        res.json({
            success: true,
            devices
        });
    } catch (error) {
        console.error('Error fetching devices:', error);
        res.status(500).json({ success: false });
    }
});

app.get('/api/analytics/ab-insights/:projectId', async (req, res) => {
    try {
        const { projectId } = req.params;
        const clicks = await AnalyticsModel.find({ projectId });

        const insightsMap = {};

        clicks.forEach(c => {
            if (!insightsMap[c.elementId]) {
                insightsMap[c.elementId] = {
                    total: 0,
                    variants: {}
                };
            }

            insightsMap[c.elementId].total += c.clickCount;
            insightsMap[c.elementId].variants[c.variantValue] = c.clickCount;
        });

        const formattedData = Object.keys(insightsMap).map(elementId => {
            const data = insightsMap[elementId];
            const variantKeys = Object.keys(data.variants);

            const varA = variantKeys[0] || 'Variant A';
            const varB = variantKeys[1] || 'Variant B';

            const clicksA = data.variants[varA] || 0;
            const clicksB = data.variants[varB] || 0;

            return {
                elementId,
                [varA]: clicksA,
                [varB]: clicksB,
                winner: clicksA > clicksB ? varA : clicksB > clicksA ? varB : 'Tie',
                diff: Math.abs(clicksA - clicksB)
            };
        });

        res.json({
            success: true,
            insights: formattedData
        });
    } catch (error) {
        console.error('AB insights error:', error);
        res.status(500).json({ success: false });
    }
});

app.post('/api/config/apply-winner', async (req, res) => {
    try {
        const { projectId, keyName, winningValue } = req.body;

        const config = await ConfigModel.findOne({
            projectId,
            keyName
        });

        if (!config) {
            return res.status(404).json({
                success: false,
                message: 'Config not found'
            });
        }

        const oldVal = config.defaultValue;

        config.defaultValue = winningValue;

        if (config.targetingRules) {
            config.targetingRules.abTestEnabled = false;
        }

        await config.save();

        delete serverCache[projectId];

        await AuditLogModel.create({
            projectId,
            action: 'Automated A/B Resolution',
            keyName,
            changes: `A/B Test concluded. Winner [${winningValue}] applied to 100%.`,
            previousValue: oldVal,
            dataType: config.dataType,
            user: 'Auto-Insight Engine'
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Apply winner error:', error);
        res.status(500).json({ success: false });
    }
});

app.get('/api/analytics/time-series/:projectId', async (req, res) => {
    const { projectId } = req.params;

    const requestedDays = Number(req.query.days || 30);
    const days = Number.isFinite(requestedDays)
        ? Math.min(Math.max(requestedDays, 1), 365)
        : 30;

    const startDate = getDateKey(
        new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000)
    );

    try {
        const timeSeries = await DailyAnalyticsModel.aggregate([
            {
                $match: {
                    projectId,
                    dateKey: { $gte: startDate }
                }
            },
            {
                $group: {
                    _id: {
                        date: '$dateKey',
                        element: '$elementId',
                        variantValue: '$variantValue'
                    },
                    totalClicks: { $sum: '$clickCount' }
                }
            },
            {
                $sort: {
                    '_id.date': 1,
                    '_id.element': 1,
                    '_id.variantValue': 1
                }
            }
        ]);

        const heatMap = await DeviceSyncModel.aggregate([
            {
                $match: { projectId }
            },
            {
                $group: {
                    _id: {
                        day: {
                            $dayOfWeek: {
                                date: '$lastSync',
                                timezone: ANALYTICS_TIMEZONE
                            }
                        },
                        hour: {
                            $hour: {
                                date: '$lastSync',
                                timezone: ANALYTICS_TIMEZONE
                            }
                        }
                    },
                    count: { $sum: 1 }
                }
            },
            {
                $sort: {
                    '_id.day': 1,
                    '_id.hour': 1
                }
            }
        ]);

        res.json({
            success: true,
            timeSeries,
            heatMap
        });
    } catch (error) {
        console.error('Time series error:', error);

        res.status(500).json({
            success: false
        });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});