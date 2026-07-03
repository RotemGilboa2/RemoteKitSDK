'use client';

import { useState, useEffect } from 'react';
import EditModal from './EditModal';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend
} from 'recharts';

export default function Dashboard() {
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);

  const [configs, setConfigs] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'configs' | 'logs' | 'analytics'>('configs');
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [analyticsData, setAnalyticsData] = useState<any[]>([]);
  const [healthStats, setHealthStats] = useState({
    total: 0,
    lastHour: 0,
    last24h: 0,
    sinceLastUpdate: 0
  });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<any>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('All');
  const [hasUnpublishedChanges, setHasUnpublishedChanges] = useState(false);

  const [originalConfigs, setOriginalConfigs] = useState<any[]>([]);
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<any[]>([]);

  const [activeDevices, setActiveDevices] = useState<any[]>([]);
  const [timeSeriesData, setTimeSeriesData] = useState<any[]>([]);
  const [heatMapData, setHeatMapData] = useState<any[]>([]);

  const [timeSeriesLabels, setTimeSeriesLabels] = useState<Record<string, string>>({});

  const chartColors = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4'];

  useEffect(() => {
    const savedProjectId = localStorage.getItem('activeProjectId');
    if (savedProjectId) {
      setActiveProjectId(savedProjectId);
    }
  }, []);

  const buildSeriesKey = (element: string, variantValue: string) => {
    return `series_${encodeURIComponent(`${element}___${variantValue}`).replace(/%/g, '_')}`;
  };

  const formatTimeSeriesData = (rawData: any[]) => {
    const rowsByDate = new Map<string, any>();
    const labels: Record<string, string> = {};

    rawData.forEach((item: any) => {
      const date = item?._id?.date;
      const element = item?._id?.element;
      const variantValue = item?._id?.variantValue ?? 'Default';
      const totalClicks = Number(item?.totalClicks || 0);

      if (!date || !element) return;

      const seriesKey = buildSeriesKey(String(element), String(variantValue));

      labels[seriesKey] = `${element} | ${variantValue}`;

      const row = rowsByDate.get(date) || { date };
      row[seriesKey] = totalClicks;
      rowsByDate.set(date, row);
    });

    return {
      rows: Array.from(rowsByDate.values()).sort((a, b) =>
        String(a.date).localeCompare(String(b.date))
      ),
      labels
    };
  };

  const loadConfigsFromDB = async (projectId: string) => {
    try {
      const response = await fetch(`http://localhost:3001/api/config/portal/${projectId}`);
      if (!response.ok) return;

      const data = await response.json();

      if (data.success) {
        setConfigs(JSON.parse(JSON.stringify(data.configs || [])));
        setOriginalConfigs(JSON.parse(JSON.stringify(data.configs || [])));
      }
    } catch (e) {
      console.error('Failed to load configs from DB', e);
    }
  };

  const loadAnalyticsFromDB = async (projectId: string) => {
    try {
      const resAnalytics = await fetch(`http://localhost:3001/api/analytics/${projectId}`);
      if (resAnalytics.ok) {
        const data = await resAnalytics.json();
        if (data.success) setAnalyticsData(data.analytics || []);
      }
    } catch (e) {
      console.error('Failed to load analytics', e);
    }

    try {
      const resHealth = await fetch(`http://localhost:3001/api/health/${projectId}`);
      if (resHealth.ok) {
        const hData = await resHealth.json();

        if (hData.success && hData.health) {
          setHealthStats({
            total: hData.health.totalDevices || 0,
            lastHour: hData.health.syncedLastHour || 0,
            last24h: hData.health.syncedLast24Hours || 0,
            sinceLastUpdate: hData.health.syncedSinceLastUpdate || 0
          });
        }
      }
    } catch (e) {
      console.error('Failed to load health', e);
    }

    try {
      const resLogs = await fetch(`http://localhost:3001/api/logs/${projectId}`);
      if (resLogs.ok) {
        const logsData = await resLogs.json();

        if (logsData.success) {
          setAuditLogs(
            logsData.logs.map((log: any) => ({
              ...log,
              timestamp: new Date(log.timestamp).toLocaleString()
            }))
          );
        }
      }
    } catch (e) {
      console.error('Failed to load logs', e);
    }

    try {
      const resDev = await fetch(`http://localhost:3001/api/devices/${projectId}`);
      if (resDev.ok) {
        const devData = await resDev.json();
        if (devData.success) setActiveDevices(devData.devices || []);
      }
    } catch (e) {
      console.error('Failed to load devices', e);
    }

    try {
      const resTrend = await fetch(`http://localhost:3001/api/analytics/time-series/${projectId}?days=30`);
      if (resTrend.ok) {
        const trendData = await resTrend.json();

        if (trendData.success) {
          const formattedTrend = formatTimeSeriesData(trendData.timeSeries || []);

          setTimeSeriesData(formattedTrend.rows);
          setTimeSeriesLabels(formattedTrend.labels);
          setHeatMapData(trendData.heatMap || []);
        }
      }
    } catch (e) {
      console.error('Failed to load trend and heatmap data', e);
    }
  };

  useEffect(() => {
    if (activeProjectId) {
      loadConfigsFromDB(activeProjectId);
      loadAnalyticsFromDB(activeProjectId);
    }
  }, [activeProjectId, activeTab]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedKey = apiKeyInput.trim();

    if (trimmedKey !== '') {
      localStorage.setItem('activeProjectId', trimmedKey);
      setActiveProjectId(trimmedKey);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('activeProjectId');
    setActiveProjectId(null);
    setConfigs([]);
    setAnalyticsData([]);
    setTimeSeriesData([]);
    setHeatMapData([]);
    setApiKeyInput('');
    setHasUnpublishedChanges(false);
    setTimeSeriesLabels({});
  };

  async function publishChanges(configsArray: any[]) {
    if (!activeProjectId) return;

    try {
      const response = await fetch('http://localhost:3001/api/config/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configsToSave: configsArray })
      });

      const result = await response.json();

      if (result.success) {
        await loadConfigsFromDB(activeProjectId);
        await loadAnalyticsFromDB(activeProjectId);
        setHasUnpublishedChanges(false);
        alert('All changes published live successfully!');
      }
    } catch (error) {
      console.error(error);
      alert('Error publishing changes.');
    }
  }

  const handleSaveRule = (updatedConfig: any) => {
    setConfigs(configs.map(c => c.keyName === updatedConfig.keyName ? updatedConfig : c));
    setHasUnpublishedChanges(true);
  };

  const handleInlineChange = (conf: any, newValue: any) => {
    setConfigs(configs.map(c => c.keyName === conf.keyName ? { ...c, defaultValue: newValue } : c));
    setHasUnpublishedChanges(true);
  };

  const handleDiscardDraft = () => {
    if (!activeProjectId) return;

    if (window.confirm('Are you sure you want to discard all unsaved changes? This will revert the dashboard to the live production state.')) {
      loadConfigsFromDB(activeProjectId);
      setHasUnpublishedChanges(false);
    }
  };

  const handleRollback = async (logId: string) => {
    if (!window.confirm('Are you sure you want to revert to this specific version?')) return;

    try {
      const response = await fetch('http://localhost:3001/api/config/rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logId })
      });

      const data = await response.json();

      if (data.success) {
        alert('Configuration rolled back successfully!');

        if (activeProjectId) {
          loadConfigsFromDB(activeProjectId);
          loadAnalyticsFromDB(activeProjectId);
        }
      } else {
        alert(data.message || 'Rollback failed.');
      }
    } catch (e) {
      console.error(e);
      alert('Error executing rollback.');
    }
  };

  const applyWinner = async (keyName: string, winningValue: string) => {
    if (!activeProjectId) return;

    if (!confirm(`Are you sure you want to apply [${winningValue}] to 100% of users and end the A/B test?`)) return;

    try {
      const response = await fetch('http://localhost:3001/api/config/apply-winner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: activeProjectId, keyName, winningValue })
      });

      const data = await response.json();

      if (data.success) {
        alert('Winner applied successfully!');
        loadConfigsFromDB(activeProjectId);
        loadAnalyticsFromDB(activeProjectId);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const handleDelete = async (keyName: string) => {
    if (!activeProjectId) return;

    if (!window.confirm(`Are you sure you want to delete ${keyName}?`)) return;

    try {
      const res = await fetch('http://localhost:3001/api/config', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: activeProjectId, keyName })
      });

      if (res.ok) {
        loadConfigsFromDB(activeProjectId);
        setHasUnpublishedChanges(true);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handlePublishClick = () => {
    if (!hasUnpublishedChanges) return;

    const changedItems = configs
      .filter(conf => {
        const original = originalConfigs.find(o => o.keyName === conf.keyName);
        if (!original) return true;

        const defaultChanged = String(original.defaultValue) !== String(conf.defaultValue);
        const targetingChanged = JSON.stringify(original.targetingRules || {}) !== JSON.stringify(conf.targetingRules || {});
        const scheduleChanged = original.scheduledTime !== conf.scheduledTime;

        return defaultChanged || targetingChanged || scheduleChanged;
      })
      .map(conf => {
        const original = originalConfigs.find(o => o.keyName === conf.keyName);
        const targetingChanged = original && JSON.stringify(original.targetingRules || {}) !== JSON.stringify(conf.targetingRules || {});

        return {
          keyName: conf.keyName,
          oldValue: original ? original.defaultValue : 'N/A',
          newValue: conf.defaultValue,
          targetingChanged
        };
      });

    if (changedItems.length > 0) {
      setPendingChanges(changedItems);
      setIsPublishModalOpen(true);
    } else {
      setHasUnpublishedChanges(false);
    }
  };

  const totalDevices = healthStats.total;
  const percent1h = totalDevices > 0 ? Math.round((healthStats.lastHour / totalDevices) * 100) : 0;
  const percent24h = totalDevices > 0 ? Math.round((healthStats.last24h / totalDevices) * 100) : 0;
  const offlineCount = Math.max(0, totalDevices - healthStats.last24h);
  const offlinePercent = totalDevices > 0 ? Math.round((offlineCount / totalDevices) * 100) : 0;
  const latestCount = healthStats.sinceLastUpdate;
  const latestPercent = totalDevices > 0 ? Math.round((latestCount / totalDevices) * 100) : 0;

  const filteredConfigs = configs.filter(conf => {
    const matchesSearch = conf.keyName.toLowerCase().includes(searchQuery.toLowerCase());

    let matchesFilter = true;

    if (filterType === 'Boolean') matchesFilter = conf.dataType === 'Boolean';
    if (filterType === 'Color') matchesFilter = typeof conf.defaultValue === 'string' && conf.defaultValue.startsWith('#');
    if (filterType === 'A/B Test') matchesFilter = conf.targetingRules?.abTestEnabled === true;

    return matchesSearch && matchesFilter;
  });

  const groupedAnalytics = analyticsData.reduce((acc: any, curr: any) => {
    if (!acc[curr.elementId]) {
      acc[curr.elementId] = {
        totalClicks: 0,
        variants: []
      };
    }

    acc[curr.elementId].totalClicks += curr.clickCount;
    acc[curr.elementId].variants.push(curr);

    return acc;
  }, {});

  const maxVariantsCount = Math.max(
    0,
    ...Object.values(groupedAnalytics).map((d: any) => d.variants.length)
  );

  const genericVariantKeys = Array.from({ length: maxVariantsCount }, (_, i) => `Variant_${i}`);

  const chartData = Object.entries(groupedAnalytics).map(([elementId, data]: [string, any]) => {
    const row: any = { elementId };

    data.variants.forEach((v: any, index: number) => {
      row[`Variant_${index}`] = v.clickCount;
      row[`VariantName_${index}`] = v.variantValue;
    });

    return row;
  });

  const lineKeys = Array.from(
    new Set(
      timeSeriesData.flatMap((row: any) =>
        Object.keys(row).filter(key => key !== 'date')
      )
    )
  );

  const heatMapDays = [
    { id: 1, label: 'Sun' },
    { id: 2, label: 'Mon' },
    { id: 3, label: 'Tue' },
    { id: 4, label: 'Wed' },
    { id: 5, label: 'Thu' },
    { id: 6, label: 'Fri' },
    { id: 7, label: 'Sat' }
  ];

  const heatMapHours = Array.from({ length: 24 }, (_, hour) => hour);

  const formatHourLabel = (hour: number) => {
    return `${String(hour).padStart(2, '0')}:00`;
  };

  const formatHourRange = (hour: number) => {
    const nextHour = (hour + 1) % 24;

    return `${String(hour).padStart(2, '0')}:00 - ${String(nextHour).padStart(2, '0')}:00`;
  };

  const totalHeatMapActiveDevices = heatMapData.reduce(
    (sum: number, item: any) => sum + Number(item?.count || 0),
    0
  );

  const busiestHeatMapCell = heatMapData.reduce((best: any, item: any) => {
    if (!best || Number(item?.count || 0) > Number(best?.count || 0)) {
      return item;
    }

    return best;
  }, null);

  const heatMapLookup = new Map(
    heatMapData.map((item: any) => [
      `${Number(item?._id?.day)}-${Number(item?._id?.hour)}`,
      Number(item?.count || 0)
    ])
  );

  const maxHeatMapCount = Math.max(
    1,
    ...heatMapData.map((item: any) => Number(item?.count || 0))
  );

  const TrendTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || payload.length === 0) return null;

    const visiblePayload = payload.filter((entry: any) => entry.value !== undefined && entry.value !== null);

    if (visiblePayload.length === 0) return null;

    return (
      <div className="bg-white p-3 border border-gray-100 shadow-lg rounded-xl min-w-[260px]">
        <p className="font-extrabold text-slate-800 mb-3 border-b border-gray-100 pb-2">
          {label}
        </p>

        {visiblePayload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center justify-between gap-4 text-sm mb-1.5">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="w-3 h-3 rounded-full shadow-sm shrink-0"
                style={{ backgroundColor: entry.color }}
              />

              <span className="text-slate-600 font-medium truncate">
                {timeSeriesLabels[String(entry.dataKey)] || entry.name || entry.dataKey}
              </span>
            </div>

            <span className="font-bold text-slate-800 shrink-0">
              {entry.value}
            </span>
          </div>
        ))}
      </div>
    );
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border border-gray-100 shadow-lg rounded-xl min-w-[200px]">
          <p className="font-extrabold text-slate-800 mb-3 border-b border-gray-100 pb-2">{label}</p>

          {payload.map((entry: any, index: number) => {
            const realIndex = entry.dataKey.split('_')[1];
            const realName = entry.payload[`VariantName_${realIndex}`];

            if (!realName) return null;

            return (
              <div key={index} className="flex items-center justify-between gap-4 text-sm mb-1.5">
                <div className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full shadow-sm"
                    style={{ backgroundColor: entry.color }}
                  />
                  <span className="text-slate-600 font-medium">{realName}</span>
                </div>

                <span className="font-bold text-slate-800">{entry.value}</span>
              </div>
            );
          })}
        </div>
      );
    }

    return null;
  };

  if (!activeProjectId) {
    return (
      <main className="flex items-center justify-center min-h-screen bg-slate-900">
        <div className="bg-white p-10 rounded-2xl shadow-2xl w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-extrabold text-slate-900 mb-2">Remote Config</h1>
            <p className="text-slate-500">Enter your Project API Key to continue</p>
          </div>

          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <input
              type="text"
              placeholder="e.g. demo-project"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              className="px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-center text-slate-900"
              required
            />

            <button
              type="submit"
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition-colors"
            >
              Access Portal
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="p-10 min-h-screen bg-gray-50 text-slate-900">
      <div className="flex justify-between items-center mb-6 max-w-5xl mx-auto">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight">Projects Dashboard</h1>

          <p className="text-sm text-gray-500 mt-1 font-mono">
            Connected to: <span className="text-blue-600 font-bold">{activeProjectId}</span>
            <button
              onClick={handleLogout}
              className="ml-4 text-slate-400 hover:text-red-500 underline cursor-pointer"
            >
              Disconnect
            </button>
          </p>
        </div>

        <div className="flex items-center gap-3">
          {hasUnpublishedChanges && (
            <button
              onClick={handleDiscardDraft}
              className="font-bold py-3 px-5 rounded-lg transition-all flex items-center gap-2 bg-slate-200 hover:bg-slate-300 text-slate-700 cursor-pointer shadow-sm"
              title="Discard all unsaved changes"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-4 h-4"
              >
                <path d="M3 6h18" />
                <path d="M8 6V4h8v2" />
                <path d="M19 6l-1 14H6L5 6" />
                <path d="M10 11v6" />
                <path d="M14 11v6" />
              </svg>

              Discard Draft
            </button>
          )}

          <button
            onClick={handlePublishClick}
            className={`font-bold py-3 px-8 rounded-lg shadow-md transition-all flex items-center gap-2 ${hasUnpublishedChanges
              ? 'bg-amber-500 hover:bg-amber-600 text-white animate-pulse ring-4 ring-amber-500/30 cursor-pointer'
              : 'bg-blue-600 hover:bg-blue-700 text-white opacity-50 cursor-not-allowed'
              }`}
            disabled={!hasUnpublishedChanges}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-4 h-4"
            >
              <path d="M12 19V5" />
              <path d="M5 12l7-7 7 7" />
              <path d="M5 19h14" />
            </svg>
            {hasUnpublishedChanges ? 'Publish Draft' : 'Publish Changes'}
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto mb-6 border-b border-gray-200 flex gap-6">
        <button
          onClick={() => setActiveTab('configs')}
          className={`pb-3 font-semibold text-lg transition-colors cursor-pointer flex items-center gap-2 ${activeTab === 'configs'
            ? 'text-blue-600 border-b-2 border-blue-600'
            : 'text-gray-500 hover:text-gray-700'
            }`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-5 h-5"
          >
            <line x1="8" y1="6" x2="21" y2="6" />
            <line x1="8" y1="12" x2="21" y2="12" />
            <line x1="8" y1="18" x2="21" y2="18" />
            <line x1="3" y1="6" x2="3.01" y2="6" />
            <line x1="3" y1="12" x2="3.01" y2="12" />
            <line x1="3" y1="18" x2="3.01" y2="18" />
          </svg>
          <span>Configuration Variables</span>
        </button>

        <button
          onClick={() => setActiveTab('analytics')}
          className={`pb-3 font-semibold text-lg transition-colors cursor-pointer flex items-center gap-2 ${activeTab === 'analytics'
            ? 'text-blue-600 border-b-2 border-blue-600'
            : 'text-gray-500 hover:text-gray-700'
            }`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-5 h-5"
          >
            <line x1="18" y1="20" x2="18" y2="10" />
            <line x1="12" y1="20" x2="12" y2="4" />
            <line x1="6" y1="20" x2="6" y2="14" />
          </svg>
          <span>Analytics & A/B Testing</span>
        </button>

        <button
          onClick={() => setActiveTab('logs')}
          className={`pb-3 font-semibold text-lg transition-colors cursor-pointer flex items-center gap-2 ${activeTab === 'logs'
            ? 'text-blue-600 border-b-2 border-blue-600'
            : 'text-gray-500 hover:text-gray-700'
            }`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-5 h-5"
          >
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
            <path d="M12 7v5l4 2" />
          </svg>
          <span>Audit Logs (History)</span>
        </button>
      </div>

      <div className="max-w-5xl mx-auto bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden min-h-[500px]">
        {activeTab === 'configs' && (
          <div className="w-full">
            <div className="bg-slate-50 p-4 border-b border-gray-200 flex gap-4 items-center">
              <div className="relative flex-1">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">🔍</span>

                <input
                  type="text"
                  placeholder="Search keys..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>

              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-semibold text-slate-700 bg-white cursor-pointer shadow-sm"
              >
                <option value="All">All Types</option>
                <option value="Boolean">Toggles</option>
                <option value="Color">Colors</option>
                <option value="A/B Test">A/B Tests</option>
              </select>
            </div>

            <div className="overflow-x-auto w-full pb-10">
              <table className="min-w-full text-left text-sm border-collapse table-fixed">
                <thead className="bg-slate-100 text-slate-600 font-bold border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-4 uppercase tracking-wider text-xs w-[25%]">Key Name</th>
                    <th className="px-4 py-4 uppercase tracking-wider text-xs w-[12%]">Type</th>
                    <th className="px-4 py-4 uppercase tracking-wider text-xs w-[28%]">Default Value</th>
                    <th className="px-2 py-4 uppercase tracking-wider text-xs w-[18%] text-left">Targeting</th>
                    <th className="px-4 py-4 text-center uppercase tracking-wider text-xs w-[17%] min-w-[140px]">Actions</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100 bg-white">
                  {filteredConfigs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-16 text-gray-400">
                        <p className="text-lg font-semibold text-gray-500">No variables found.</p>
                      </td>
                    </tr>
                  ) : (
                    filteredConfigs.map((conf, index) => (
                      <tr key={index} className="hover:bg-slate-50 transition-all group">
                        <td className="px-4 py-4">
                          <button
                            onClick={() => copyToClipboard(conf.keyName)}
                            className="font-mono font-bold text-blue-600 hover:text-blue-800 flex items-center gap-2 transition-colors cursor-pointer text-left w-full"
                            title="Click to copy"
                          >
                            <span className="truncate">{conf.keyName}</span>
                          </button>
                        </td>

                        <td className="px-4 py-4">
                          <span
                            className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide whitespace-nowrap ${conf.dataType === 'Boolean'
                              ? 'bg-emerald-100 text-emerald-700'
                              : conf.dataType === 'Number'
                                ? 'bg-purple-100 text-purple-700'
                                : 'bg-slate-100 text-slate-700'
                              }`}
                          >
                            {conf.dataType}
                          </span>
                        </td>

                        <td className="px-4 py-4">
                          {conf.dataType === 'Boolean' ? (
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input
                                type="checkbox"
                                className="sr-only peer"
                                checked={conf.defaultValue === true || conf.defaultValue === 'true'}
                                onChange={(e) => handleInlineChange(conf, e.target.checked)}
                              />

                              <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600" />
                            </label>
                          ) : conf.keyName.toLowerCase().includes('color') ? (
                            <div className="flex items-center gap-3">
                              <div className="relative w-8 h-8 rounded-full shadow-inner border-2 border-gray-200 overflow-hidden cursor-pointer hover:scale-110 transition-transform shrink-0">
                                <input
                                  type="color"
                                  value={
                                    typeof conf.defaultValue === 'string' && conf.defaultValue.startsWith('#')
                                      ? conf.defaultValue
                                      : '#ffffff'
                                  }
                                  onChange={(e) => handleInlineChange(conf, e.target.value)}
                                  className="absolute top-[-10px] left-[-10px] w-16 h-16 cursor-pointer"
                                />
                              </div>

                              <span className="font-mono text-slate-600 uppercase text-xs truncate">
                                {conf.defaultValue}
                              </span>
                            </div>
                          ) : (
                            <div className="font-mono text-slate-700 bg-slate-100 px-3 py-2 rounded-lg break-words whitespace-pre-wrap w-full text-xs max-h-24 overflow-y-auto">
                              {String(conf.defaultValue)}
                            </div>
                          )}
                        </td>

                        <td className="px-2 py-4">
                          <div className="flex flex-col items-start justify-center gap-1.5">
                            {conf.targetingRules?.abTestEnabled && (
                              <span
                                className="flex items-center gap-1.5 bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-bold px-2 py-1.5 rounded-lg cursor-help w-full max-w-[140px]"
                                title="A/B Test Active"
                              >
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  className="w-3.5 h-3.5 shrink-0"
                                >
                                  <path d="M16 3h5v5" />
                                  <path d="M8 3H3v5" />
                                  <path d="M12 22v-8.3a4 4 0 0 0-1.17-2.83C9.65 9.7 8 8 8 8" />
                                  <path d="m21 3-5.26 5.26A6 6 0 0 0 14 12.5V22" />
                                </svg>

                                <span className="truncate">
                                  A/B: {conf.targetingRules.abTestPercentage}% ➔ {String(conf.targetingRules.abTestVariantValue)}
                                </span>
                              </span>
                            )}

                            {conf.targetingRules?.country && (
                              <span
                                className="flex items-center gap-1.5 bg-sky-50 text-sky-700 border border-sky-200 text-[10px] font-bold px-2 py-1.5 rounded-lg cursor-help w-full max-w-[140px]"
                                title={`Targeting: ${conf.targetingRules.country}`}
                              >
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  className="w-3.5 h-3.5 shrink-0"
                                >
                                  <circle cx="12" cy="12" r="10" />
                                  <line x1="2" y1="12" x2="22" y2="12" />
                                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                                </svg>

                                <span className="truncate">
                                  {conf.targetingRules.country}: {String(conf.targetingRules.countryValue)}
                                </span>
                              </span>
                            )}

                            {conf.scheduledTime && (
                              <span
                                className="flex items-center gap-1.5 bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold px-2 py-1.5 rounded-lg cursor-help w-full max-w-[140px]"
                                title="Scheduled Rollout"
                              >
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  className="w-3.5 h-3.5 shrink-0"
                                >
                                  <circle cx="12" cy="12" r="10" />
                                  <polyline points="12 6 12 12 16 14" />
                                </svg>

                                <span className="truncate">
                                  {new Date(conf.scheduledTime).toLocaleDateString('en-GB', {
                                    day: '2-digit',
                                    month: 'short',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}
                                </span>
                              </span>
                            )}

                            {!conf.targetingRules?.abTestEnabled && !conf.targetingRules?.country && !conf.scheduledTime && (
                              <span className="text-gray-300 font-mono">-</span>
                            )}
                          </div>
                        </td>

                        <td className="px-4 py-4 text-center">
                          <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => {
                                setEditingConfig(conf);
                                setIsModalOpen(true);
                              }}
                              className="text-[11px] text-slate-600 bg-slate-200 hover:bg-slate-300 px-3 py-1.5 rounded-md font-bold transition-colors cursor-pointer shrink-0"
                            >
                              Advanced
                            </button>

                            <button
                              onClick={() => handleDelete(conf.keyName)}
                              className="text-[11px] text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-md font-bold transition-colors cursor-pointer border border-transparent hover:border-red-200 shrink-0"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'analytics' && (
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
              <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between">
                <h3 className="text-gray-500 text-xs font-bold mb-1 uppercase tracking-wider">Total Devices</h3>
                <div className="flex items-end gap-2">
                  <p className="text-4xl font-extrabold text-slate-800">{totalDevices}</p>
                </div>
                <p className="text-xs text-gray-400 mt-2">Ever connected to project</p>
              </div>

              <div className="bg-emerald-50 p-5 rounded-xl border border-emerald-100 shadow-sm flex flex-col justify-between">
                <h3 className="text-emerald-700 text-xs font-bold mb-1 uppercase tracking-wider">Live / Synced (1H)</h3>
                <div className="flex items-end gap-2">
                  <p className="text-4xl font-extrabold text-emerald-600">{healthStats.lastHour}</p>
                  <span className="text-sm font-bold text-emerald-700 mb-1 bg-emerald-200/60 px-2 py-0.5 rounded-full">{percent1h}%</span>
                </div>
                <p className="text-xs text-emerald-600/70 mt-2">Active in last hour</p>
              </div>

              <div className="bg-blue-50 p-5 rounded-xl border border-blue-100 shadow-sm flex flex-col justify-between">
                <h3 className="text-blue-700 text-xs font-bold mb-1 uppercase tracking-wider">Active Today (24H)</h3>
                <div className="flex items-end gap-2">
                  <p className="text-4xl font-extrabold text-blue-600">{healthStats.last24h}</p>
                  <span className="text-sm font-bold text-blue-700 mb-1 bg-blue-200/60 px-2 py-0.5 rounded-full">{percent24h}%</span>
                </div>
                <p className="text-xs text-blue-600/70 mt-2">Opened the app today</p>
              </div>

              <div className="bg-rose-50 p-5 rounded-xl border border-rose-100 shadow-sm flex flex-col justify-between">
                <h3 className="text-rose-700 text-xs font-bold mb-1 uppercase tracking-wider">Offline / Stale</h3>
                <div className="flex items-end gap-2">
                  <p className="text-4xl font-extrabold text-rose-600">{offlineCount}</p>
                  <span className="text-sm font-bold text-rose-700 mb-1 bg-rose-200/60 px-2 py-0.5 rounded-full">{offlinePercent}%</span>
                </div>
                <p className="text-xs text-rose-600/70 mt-2">Inactive over 24 hours</p>
              </div>

              <div className="bg-purple-50 p-5 rounded-xl border border-purple-100 shadow-sm flex flex-col justify-between">
                <h3 className="text-purple-700 text-xs font-bold mb-1 uppercase tracking-wider">On Latest Version</h3>
                <div className="flex items-end gap-2">
                  <p className="text-4xl font-extrabold text-purple-600">{latestCount}</p>
                  <span className="text-sm font-bold text-purple-700 mb-1 bg-purple-200/60 px-2 py-0.5 rounded-full">{latestPercent}%</span>
                </div>
                <p className="text-xs text-purple-600/70 mt-2">Synced since last update</p>
              </div>
            </div>

            <h3 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
              A/B Testing Conversions

              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-6 h-6 text-amber-500"
              >
                <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
                <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
                <path d="M4 22h16" />
                <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
                <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
                <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
              </svg>
            </h3>

            <table className="min-w-full text-left text-sm border border-gray-200 rounded-lg overflow-hidden mb-12">
              <thead className="bg-indigo-50 text-indigo-900 font-semibold border-b border-indigo-100">
                <tr>
                  <th className="px-6 py-4">Element ID</th>
                  <th className="px-6 py-4">Variant Tested</th>
                  <th className="px-6 py-4 text-center">Conversion Rate (Clicks)</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100 bg-white">
                {Object.entries(groupedAnalytics).map(([elementId, data]: [string, any]) => {
                  const maxClicks = Math.max(...data.variants.map((v: any) => v.clickCount));

                  return data.variants.map((variant: any, idx: number) => {
                    const isWinner = variant.clickCount === maxClicks && variant.clickCount > 0;
                    const percentage = data.totalClicks > 0
                      ? Math.round((variant.clickCount / data.totalClicks) * 100)
                      : 0;

                    return (
                      <tr key={`${elementId}-${idx}`} className={isWinner ? 'bg-emerald-50/30' : 'hover:bg-gray-50'}>
                        <td className="px-6 py-4 font-mono font-bold text-slate-800">
                          {idx === 0 ? elementId : <span className="text-gray-300 ml-4">↳</span>}
                        </td>

                        <td className="px-6 py-4">
                          <span className="bg-slate-100 text-slate-700 px-3 py-1.5 rounded-md font-mono text-xs font-semibold">
                            {variant.variantValue}
                          </span>
                        </td>

                        <td className="px-6 py-4">
                          <div className="flex items-center gap-4">
                            <span className={`font-bold w-10 text-right ${isWinner ? 'text-emerald-600' : 'text-slate-600'}`}>
                              {variant.clickCount}
                            </span>

                            <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden flex-1">
                              <div
                                className={`h-2.5 rounded-full ${isWinner
                                  ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]'
                                  : 'bg-blue-400'
                                  }`}
                                style={{ width: `${percentage}%` }}
                              />
                            </div>

                            <span className="text-xs text-gray-500 font-mono w-10">
                              {percentage}%
                            </span>

                            <div className="w-6 text-center flex items-center justify-center">
                              {isWinner && (
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  className="w-5 h-5 text-amber-500 drop-shadow-sm"
                                  role="img"
                                  aria-label="Top performing variant"
                                >
                                  <title>Top performing variant</title>
                                  <path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7z" />
                                  <path d="M3 20h18" />
                                </svg>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  });
                })}
              </tbody>
            </table>

            {chartData.length > 0 && (
              <div className="mb-12">
                <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
                  <h3 className="font-bold text-slate-800 mb-6">A/B Performance (Clicks)</h3>

                  <div className="w-full h-[320px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ top: 20, right: 0, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="elementId" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                        <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f8fafc' }} />

                        {genericVariantKeys.map((key, idx) => (
                          <Bar
                            key={key}
                            dataKey={key}
                            fill={chartColors[idx % chartColors.length]}
                            radius={[4, 4, 0, 0]}
                            barSize={40}
                          />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm mb-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="font-bold text-slate-800">Clicks Trend Over Time</h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Daily clicks grouped by element and variant value
                  </p>
                </div>
              </div>

              <div className="w-full h-[300px]">
                {timeSeriesData.length === 0 || lineKeys.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-slate-400 text-sm font-semibold">
                    No click trend data yet
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={timeSeriesData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                      <YAxis allowDecimals={false} />
                      <Tooltip content={<TrendTooltip />} />
                      <Legend
                        formatter={(value: any) => (
                          <span className="text-xs text-slate-600">
                            {timeSeriesLabels[String(value)] || value}
                          </span>
                        )}
                      />

                      {lineKeys.map((key, i) => (
                        <Line
                          key={key}
                          type="monotone"
                          dataKey={key}
                          name={timeSeriesLabels[key] || key}
                          stroke={chartColors[i % chartColors.length]}
                          strokeWidth={3}
                          dot={{ r: 4 }}
                          connectNulls
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm mb-6">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h3 className="font-bold text-slate-800">Activity Heatmap</h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Active devices grouped by weekday and hour
                  </p>
                </div>

                <div className="text-right text-xs text-slate-500">
                  <p>
                    Total active slots:{' '}
                    <span className="font-bold text-slate-800">{totalHeatMapActiveDevices}</span>
                  </p>

                  {busiestHeatMapCell && (
                    <p className="mt-1">
                      Peak:{' '}
                      <span className="font-bold text-indigo-600">
                        {heatMapDays.find(day => day.id === Number(busiestHeatMapCell?._id?.day))?.label || 'Unknown'}{' '}
                        {formatHourRange(Number(busiestHeatMapCell?._id?.hour || 0))}
                      </span>
                    </p>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto">
                <div className="min-w-[920px]">
                  <div
                    className="grid gap-[3px] items-center"
                    style={{ gridTemplateColumns: '64px repeat(24, minmax(28px, 1fr))' }}
                  >
                    <div />

                    {heatMapHours.map(hour => (
                      <div
                        key={`hour-${hour}`}
                        className="text-[10px] text-slate-400 text-center font-mono"
                      >
                        {hour % 3 === 0 ? formatHourLabel(hour) : ''}
                      </div>
                    ))}

                    {heatMapDays.map(day => (
                      <div key={`row-${day.id}`} className="contents">
                        <div className="text-xs font-bold text-slate-500 pr-2">
                          {day.label}
                        </div>

                        {heatMapHours.map(hour => {
                          const count = heatMapLookup.get(`${day.id}-${hour}`) || 0;
                          const opacity = count > 0 ? Math.max(0.18, count / maxHeatMapCount) : 0;

                          return (
                            <div
                              key={`${day.id}-${hour}`}
                              className="h-8 rounded-md flex items-center justify-center text-[10px] font-bold border border-slate-100 transition-transform hover:scale-110 hover:z-10 cursor-default"
                              style={{
                                backgroundColor: count > 0
                                  ? `rgba(99, 102, 241, ${opacity})`
                                  : '#f8fafc',
                                color: count > 0 && opacity > 0.55 ? '#ffffff' : '#475569'
                              }}
                              title={`${day.label}, ${formatHourRange(hour)}: ${count} active devices`}
                            >
                              {count > 0 ? count : ''}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between mt-4 text-[11px] text-slate-400">
                <span>Less active</span>

                <div className="flex items-center gap-1">
                  {[0.15, 0.3, 0.5, 0.75, 1].map(level => (
                    <span
                      key={level}
                      className="w-5 h-3 rounded-sm"
                      style={{ backgroundColor: `rgba(99, 102, 241, ${level})` }}
                    />
                  ))}
                </div>

                <span>More active</span>
              </div>
            </div>

            <div>
              <h3 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
                Live Connected Devices

                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="w-5 h-5 text-blue-500"
                >
                  <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                  <line x1="12" y1="18" x2="12.01" y2="18" />
                </svg>
              </h3>

              <div className="border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-4 uppercase tracking-wider text-[11px]">Device ID</th>
                      <th className="px-6 py-4 uppercase tracking-wider text-[11px] text-center">Region</th>
                      <th className="px-6 py-4 uppercase tracking-wider text-[11px]">A/B Variants Assigned</th>
                      <th className="px-6 py-4 uppercase tracking-wider text-[11px]">Last Sync</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-gray-100">
                    {activeDevices.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="text-center py-10 text-gray-400 font-medium">
                          No devices connected in the last 24 hours.
                        </td>
                      </tr>
                    ) : (
                      activeDevices.map((device, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4 font-mono text-xs font-bold text-slate-700">
                            {device.deviceId.substring(0, 12)}...
                          </td>

                          <td className="px-6 py-4 text-center">
                            <span className="bg-sky-50 text-sky-700 px-2.5 py-1 rounded-md font-bold text-xs border border-sky-100">
                              {device.country !== 'Unknown' ? `${device.country}` : 'Unknown'}
                            </span>
                          </td>

                          <td className="px-6 py-4">
                            {Object.keys(device.abGroups || {}).length > 0 ? (
                              <div className="flex flex-col gap-1">
                                {Object.entries(device.abGroups).map(([key, variant]: [string, any]) => (
                                  <span
                                    key={key}
                                    className="text-[11px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded border border-indigo-100 w-max"
                                  >
                                    <strong className="mr-1">{key}:</strong> {variant}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-gray-400 text-xs italic">Default Configs</span>
                            )}
                          </td>

                          <td className="px-6 py-4 text-xs text-gray-500 font-mono">
                            {new Date(device.lastSync).toLocaleTimeString()}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'logs' && (
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-800 text-slate-100 font-semibold">
              <tr>
                <th className="px-6 py-4 w-[15%]">Timestamp</th>
                <th className="px-6 py-4 w-[15%]">Action</th>
                <th className="px-6 py-4 w-[20%]">Key Modified</th>
                <th className="px-6 py-4 w-[35%]">Changes Details</th>
                <th className="px-6 py-4 w-[15%] text-center">Revert Version</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-200 bg-white">
              {auditLogs.map((log) => (
                <tr key={log._id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 font-mono text-xs text-gray-500">{log.timestamp}</td>
                  <td className="px-6 py-4 font-bold text-gray-700">{log.action}</td>
                  <td className="px-6 py-4 font-mono text-blue-600">{log.keyName}</td>
                  <td className="px-6 py-4 text-gray-700 bg-yellow-50/50 font-mono text-xs leading-relaxed">{log.changes}</td>

                  <td className="px-6 py-4 text-center">
                    {log.previousValue !== undefined && log.previousValue !== null ? (
                      <button
                        onClick={() => handleRollback(log._id)}
                        className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-1.5 px-3 rounded transition-all shadow-sm cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="w-3.5 h-3.5"
                        >
                          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                          <path d="M3 3v5h5" />
                        </svg>

                        Rollback
                      </button>
                    ) : (
                      <span className="text-gray-400 text-xs font-mono">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {isModalOpen && (
        <EditModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          configData={editingConfig}
          onSave={handleSaveRule}
        />
      )}

      {isPublishModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-gray-100 bg-slate-50 flex justify-between items-center">
              <h2 className="text-xl font-extrabold text-slate-800 flex items-center gap-2">
                <span>🚀</span> Review Changes Before Publishing
              </h2>

              <button
                onClick={() => setIsPublishModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                ✖
              </button>
            </div>

            <div className="p-6 overflow-y-auto bg-white flex-1">
              <p className="text-sm text-slate-500 mb-4">
                You are about to push the following <strong className="text-slate-800">{pendingChanges.length} changes</strong> to production. This action will immediately affect all live devices.
              </p>

              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-100 text-slate-600 font-bold">
                    <tr>
                      <th className="px-4 py-3">Key Name</th>
                      <th className="px-4 py-3 text-red-600 w-1/3">Old Value</th>
                      <th className="px-4 py-3 text-emerald-600 w-1/3">New Value</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-gray-100">
                    {pendingChanges.map((change, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-mono font-bold text-blue-600">{change.keyName}</td>
                        <td className="px-4 py-3 font-mono text-red-500 bg-red-50/50 break-words">{String(change.oldValue)}</td>
                        <td className="px-4 py-3 font-mono text-emerald-600 bg-emerald-50/50 font-bold break-words">
                          ➔ {String(change.newValue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 bg-slate-50 flex justify-end gap-3">
              <button
                onClick={() => setIsPublishModalOpen(false)}
                className="px-5 py-2.5 rounded-lg font-bold text-slate-600 bg-slate-200 hover:bg-slate-300 transition-colors cursor-pointer"
              >
                Cancel
              </button>

              <button
                onClick={() => {
                  setIsPublishModalOpen(false);
                  publishChanges(configs);
                }}
                className="px-6 py-2.5 rounded-lg font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-md cursor-pointer flex items-center gap-2"
              >
                Confirm & Go Live
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}