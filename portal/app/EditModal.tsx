'use client';
import { useState } from 'react';

interface EditModalProps {
    isOpen: boolean;
    onClose: () => void;
    configData: any;
    onSave: (updatedConfig: any) => void;
}

const COUNTRIES = [
    { code: 'IL', name: 'Israel', flag: '🇮🇱' },
    { code: 'US', name: 'USA', flag: '🇺🇸' },
    { code: 'GB', name: 'UK', flag: '🇬🇧' },
    { code: 'DE', name: 'Germany', flag: '🇩🇪' },
    { code: 'FR', name: 'France', flag: '🇫🇷' },
    { code: 'CA', name: 'Canada', flag: '🇨🇦' },
    { code: 'AU', name: 'Australia', flag: '🇦🇺' },
    { code: 'BR', name: 'Brazil', flag: '🇧🇷' },
    { code: 'JP', name: 'Japan', flag: '🇯🇵' },
    { code: 'IN', name: 'India', flag: '🇮🇳' }
];

export default function EditModal({ isOpen, onClose, configData, onSave }: EditModalProps) {
    const [defaultValue, setDefaultValue] = useState(configData?.defaultValue ?? '');

    const [country, setCountry] = useState(configData?.targetingRules?.country ?? '');
    const [countryValue, setCountryValue] = useState(configData?.targetingRules?.countryValue ?? '');

    const [abTestEnabled, setAbTestEnabled] = useState(configData?.targetingRules?.abTestEnabled ?? false);
    const [abTestPercentage, setAbTestPercentage] = useState(configData?.targetingRules?.abTestPercentage ?? 50);
    const [abTestVariantValue, setAbTestVariantValue] = useState(configData?.targetingRules?.abTestVariantValue ?? '');

    const [scheduledTime, setScheduledTime] = useState(configData?.scheduledTime ?? '');

    if (!isOpen) return null;

    const parseValue = (val: any) => {
        if (configData.dataType === 'Boolean') return (val === true || val === 'true');
        if (configData.dataType === 'Number') return Number(val);
        return val;
    };

    const handleSave = () => {
        const updatedConfig = {
            ...configData,
            defaultValue: parseValue(defaultValue),
            targetingRules: {
                country: country || null,
                countryValue: country ? parseValue(countryValue) : null,
                abTestEnabled,
                abTestPercentage: Number(abTestPercentage),
                abTestVariantValue: abTestEnabled ? parseValue(abTestVariantValue) : null,
            },
            scheduledTime: scheduledTime || null,
        };
        onSave(updatedConfig);
        onClose();
    };

    const renderInput = (value: any, setValue: (val: any) => void, placeholder: string) => {
        if (configData.dataType === 'Boolean') {
            return (
                <select
                    value={String(value)}
                    onChange={(e) => setValue(e.target.value === 'true')}
                    className="w-full border border-gray-300 rounded-lg p-2.5 bg-white focus:ring-2 focus:ring-blue-500 outline-none font-medium text-gray-700"
                >
                    <option value="true">True (פעיל)</option>
                    <option value="false">False (כבוי)</option>
                </select>
            );
        }

        if (configData.keyName.toLowerCase().includes('color')) {
            const hexValue = (typeof value === 'string' && value.startsWith('#')) ? value : '#ffffff';
            return (
                <div className="flex gap-2 w-full items-center">
                    <input
                        type="color"
                        value={hexValue}
                        onChange={(e) => setValue(e.target.value)}
                        className="w-12 h-11 p-1 border border-gray-300 rounded-lg cursor-pointer bg-white flex-shrink-0"
                    />
                    <input
                        type="text"
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg p-2.5 outline-none font-mono text-sm text-gray-700 focus:ring-2 focus:ring-blue-500"
                        placeholder={placeholder}
                    />
                </div>
            );
        }

        return (
            <input
                type={configData.dataType === 'Number' ? 'number' : 'text'}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="w-full border border-gray-300 rounded-lg p-2.5 outline-none text-gray-700 focus:ring-2 focus:ring-blue-500"
                placeholder={placeholder}
            />
        );
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto transform transition-all border border-gray-100">

                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-gray-800">
                        Edit Key: <span className="text-blue-600 font-mono bg-blue-50 px-2 py-1 rounded text-xl ml-1">{configData?.keyName}</span>
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full w-8 h-8 flex items-center justify-center font-bold text-2xl transition-colors">&times;</button>
                </div>

                {/* 1. Base Value */}
                <div className="mb-6 bg-gray-50 p-4 rounded-xl border border-gray-100">
                    <label className="block text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">Base Value</label>
                    {renderInput(defaultValue, setDefaultValue, `Enter ${configData.dataType} value...`)}
                </div>

                <hr className="my-8 border-gray-200" />
                <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <span>🎯</span> Advanced Targeting
                </h3>

                {/* 2. Country Override */}
                <div className="bg-white p-4 rounded-xl mb-4 border border-gray-200 shadow-sm">
                    <h4 className="font-semibold text-gray-700 mb-3 text-sm">Country Override</h4>
                    <div className="flex gap-4 items-start">
                        <select
                            value={country}
                            onChange={(e) => setCountry(e.target.value)}
                            className="border border-gray-300 rounded-lg p-2.5 w-1/3 bg-white outline-none focus:ring-2 focus:ring-blue-500 text-sm text-gray-700 h-11"
                        >
                            <option value="">🌍 Global (None)</option>
                            {COUNTRIES.map(c => (
                                <option key={c.code} value={c.code}>
                                    {c.flag} {c.name} ({c.code})
                                </option>
                            ))}
                        </select>
                        <div className="w-2/3">
                            {renderInput(countryValue, setCountryValue, "Value for this country...")}
                        </div>
                    </div>
                </div>

                {/* 3. A/B Testing */}
                <div className={`p-4 rounded-xl mb-4 border transition-colors ${abTestEnabled ? 'bg-purple-50 border-purple-200' : 'bg-white border-gray-200 shadow-sm'}`}>
                    <div className="flex justify-between items-center mb-3">
                        <h4 className={`font-semibold text-sm ${abTestEnabled ? 'text-purple-900' : 'text-gray-700'}`}>A/B Testing</h4>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={abTestEnabled}
                                onChange={(e) => setAbTestEnabled(e.target.checked)}
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                        </label>
                    </div>

                    {abTestEnabled && (
                        <div className="space-y-4 mt-4 pt-4 border-t border-purple-100">
                            <div>
                                <div className="flex justify-between text-xs text-purple-700 mb-2 font-bold">
                                    <span>Exposure Weight</span>
                                    <span className="bg-purple-100 px-2 py-0.5 rounded-full">{abTestPercentage}%</span>
                                </div>
                                <input
                                    type="range" min="1" max="100"
                                    value={abTestPercentage}
                                    onChange={(e) => setAbTestPercentage(Number(e.target.value))}
                                    className="w-full accent-purple-600 bg-purple-200 h-2 rounded-lg appearance-none cursor-pointer"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-purple-700 mb-2 uppercase tracking-wide">Variant Value</label>
                                {renderInput(abTestVariantValue, setAbTestVariantValue, "Variant Value (for test group)")}
                            </div>
                        </div>
                    )}
                </div>

                {/* 4. Schedule Rollout */}
                <div className="bg-white shadow-sm p-4 rounded-xl mb-6 border border-gray-200">
                    <h4 className="font-semibold text-gray-700 mb-2 text-sm flex items-center gap-2">
                        <span>⏱️</span> Schedule Rollout
                    </h4>
                    <input
                        type="datetime-local"
                        value={scheduledTime}
                        onChange={(e) => setScheduledTime(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg p-2.5 outline-none bg-white focus:ring-2 focus:ring-blue-500 text-sm text-gray-700"
                    />
                    <p className="text-xs text-gray-500 mt-2">Leave empty to publish immediately.</p>
                </div>

                <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-gray-100">
                    <button onClick={onClose} className="px-6 py-2.5 text-gray-600 text-sm font-semibold hover:bg-gray-100 rounded-lg transition-colors">
                        Cancel
                    </button>
                    <button onClick={handleSave} className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg shadow-md transition-all transform hover:scale-105">
                        Save Rule
                    </button>
                </div>

            </div>
        </div>
    );
}