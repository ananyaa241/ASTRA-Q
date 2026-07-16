'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useThreatData } from '@/hooks/useThreatData';
import { useAuth } from '@/context/AuthContext';
import NavSidebar from '@/components/common/NavSidebar';
import { triggerContainment } from '@/lib/api';
import type { ThreatSession, ContainmentAction } from '@/lib/types';

interface MiddlemanEmployee {
    id: string;
    name: string;
    role: string;
    risk: number;
    access: number; // 0 to 100
    system: string;
    alerted: boolean;
    targetUser: string;
}

export default function ThreatReportPage() {
    const { session } = useAuth();
    const { threats } = useThreatData();
    const [downloading, setDownloading] = useState(false);
    const [mitigatingId, setMitigatingId] = useState<string | null>(null);

    // ── Employee Privilege Control State ─────────────────────────────────────
    const [employees, setEmployees] = useState<MiddlemanEmployee[]>([
        { id: 'partner_consultant_ext', name: 'Alok V. (Consultant)', role: 'Third-Party Vendor', risk: 92, access: 25, system: 'Financial Ledger', alerted: false, targetUser: 'Fin-Direct-Acct' },
        { id: 'vendor_acme_datasync', name: 'Acme DataSync API', role: 'Middleman Syncbot', risk: 87, access: 50, system: 'Client CRM Database', alerted: false, targetUser: 'CRM-Admin-Acct' },
        { id: 'vendor_salesforce_sync', name: 'Salesforce Outbound Sync', role: 'External Connector', risk: 64, access: 100, system: 'Customer DB Pipeline', alerted: false, targetUser: 'Sales-Direct-Acct' },
        { id: 'emp_john_devops', name: 'John Doe (DevOps Lead)', role: 'Internal Contractor', risk: 14, access: 100, system: 'Core Auth Gateway', alerted: false, targetUser: 'Auth-Root-Acct' },
    ]);

    // Visual simulation overlay state
    const [verifyingPolicy, setVerifyingPolicy] = useState<boolean>(false);
    const [signingLog, setSigningLog] = useState<string>('');
    const [signedTxHash, setSignedTxHash] = useState<string | null>(null);

    // ── Derived threat counts ───────────────────────────────────────────────
    const criticalHighList = useMemo(() => {
        return threats.filter(t => t.risk_tier === 'CRITICAL' || t.risk_tier === 'HIGH');
    }, [threats]);

    const allAlertsCount = threats.length;

    // Checklist state
    const [checks, setChecks] = useState<Record<number, boolean>>({
        0: true,
        1: allAlertsCount < 3,
        2: threats.filter(t => t.risk_tier === 'CRITICAL' || t.risk_tier === 'HIGH').length === 0,
        3: false,
    });
    const handleToggleCheck = (index: number) => {
        setChecks(prev => ({ ...prev, [index]: !prev[index] }));
    };
    const criticalCount = threats.filter(t => t.risk_tier === 'CRITICAL').length;
    const highCount = threats.filter(t => t.risk_tier === 'HIGH').length;

    const handleMitigate = async (threat: ThreatSession, action: ContainmentAction) => {
        setMitigatingId(threat.session_id);
        try {
            await triggerContainment({
                session_id: threat.session_id,
                user_id: threat.user_id,
                action,
                analyst_id: session?.analystId ?? 'analyst_soc',
                reason: 'Automated mitigation triggered from Threat Report gateway.',
            });
            // Pause briefly for user feedback
            await new Promise(resolve => setTimeout(resolve, 800));
        } catch (err) {
            console.error(err);
        } finally {
            setMitigatingId(null);
        }
    };

    const handleSliderChange = (id: string, value: number) => {
        setEmployees(prev => prev.map(emp => emp.id === id ? { ...emp, access: value } : emp));
    };

    const handleSendThreatAlert = async (id: string) => {
        setEmployees(prev => prev.map(emp => emp.id === id ? { ...emp, alerted: true } : emp));
        try {
            // Dispatch alert request to PQC containment endpoint
            await triggerContainment({
                session_id: `alert-dispatch-${id}`,
                user_id: id,
                action: 'ALERT_ANALYST',
                analyst_id: session?.analystId ?? 'analyst_soc',
                reason: `Threat warning alert dispatched directly to account: ${id}`,
            });
            alert(`Threat warning warning alert successfully dispatched to ${id}.`);
        } catch (err) {
            console.error(err);
        }
    };

    const handleApplyAccessPolicy = async (emp: MiddlemanEmployee) => {
        setVerifyingPolicy(true);
        setSignedTxHash(null);
        setSigningLog('Initializing post-quantum session state...');

        // Simulate multi-step cryptographic verification dialog
        await new Promise(r => setTimeout(r, 600));
        setSigningLog('Generating key encapsulation handshake...');
        await new Promise(r => setTimeout(r, 600));
        setSigningLog('Signing policy constraints with ML-DSA-87 signature algorithm...');
        await new Promise(r => setTimeout(r, 700));

        try {
            // Connect to the backend containment endpoint to secure the action in the signed ledger
            const res = await triggerContainment({
                session_id: `policy-${emp.id}-${Date.now().toString().substring(8)}`,
                user_id: emp.id,
                action: emp.access === 0 ? 'LOCK_ACCOUNT' : emp.access <= 50 ? 'MONITOR_ENHANCED' : 'ALERT_ANALYST',
                analyst_id: session?.analystId ?? 'analyst_soc',
                reason: `Adaptive privilege set to ${emp.access}% for direct target user account ${emp.targetUser}.`,
            });

            setSigningLog('Policy broadcast successfully propagated and locked in the secure database.');
            setSignedTxHash(res.pqc_signature);
            await new Promise(r => setTimeout(r, 1200));
        } catch (err) {
            setSigningLog('Failed to secure policy constraint. Handshake timeout.');
            console.error(err);
        } finally {
            setVerifyingPolicy(false);
        }
    };

    const handleMockDownload = () => {
        setDownloading(true);
        setTimeout(() => {
            setDownloading(false);
            alert('Report exported successfully matches PQC signed ledger standards.');
        }, 1200);
    };

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            background: 'var(--color-bg-base)',
            zIndex: 1,
        }}>
            {/* ══ NAV SIDEBAR ══════════════════════════════════════════════ */}
            <NavSidebar activePath="/dashboard/report" criticalCount={criticalHighList.length} />

            {/* ══ MAIN CONTAINER ═════════════════════════════════════════ */}
            <div style={{ paddingLeft: 48, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>

                {/* ══ HEADER ════════════════════════════════════════════════ */}
                <header style={{
                    flexShrink: 0,
                    height: 52,
                    background: 'var(--color-bg-glass)',
                    borderBottom: '1px solid var(--color-border)',
                    padding: '0 20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 28, height: 28, background: 'var(--color-cyan)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-bg-surface)" strokeWidth="3">
                                <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                            </svg>
                        </div>
                        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 16, color: 'var(--color-text-primary)' }}>
                            ASTRA-Q // Threat Report & Adaptive Privilege Control
                        </span>
                    </div>

                    <button
                        onClick={handleMockDownload}
                        disabled={downloading}
                        style={{
                            padding: '6px 14px',
                            borderRadius: 6,
                            background: 'var(--color-cyan)',
                            color: 'var(--color-bg-surface)',
                            border: 'none',
                            fontFamily: 'var(--font-sans)',
                            fontSize: 12,
                            fontWeight: 500,
                            cursor: 'pointer',
                            opacity: downloading ? 0.6 : 1,
                            transition: 'opacity 150ms',
                        }}
                    >
                        {downloading ? 'Generating PDF...' : 'Export Security Audit Report'}
                    </button>
                </header>

                {/* ══ REPORT PANEL BODY ════════════════════════════════════════ */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>

                    {/* Executive Stats Summary Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                        {[
                            { label: 'Total Threat Detections', value: allAlertsCount, color: 'var(--color-text-primary)' },
                            { label: 'Critical Risk Vector', value: criticalCount, color: 'var(--color-critical)' },
                            { label: 'High Urgency Anomalies', value: highCount, color: 'var(--color-high)' },
                            { label: 'Middleman Active Score', value: '4 Managed', color: 'var(--color-cyan)' }
                        ].map((stat, i) => (
                            <div key={i} className="glass-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <span style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 500, textTransform: 'uppercase' }}>
                                    {stat.label}
                                </span>
                                <span style={{ fontSize: 26, fontWeight: 700, color: stat.color, fontFamily: 'var(--font-display)' }}>
                                    {stat.value}
                                </span>
                            </div>
                        ))}
                    </div>

                    {/* ══ SECTION 1: EMPLOYEE / MIDDLEMAN ADAPTIVE PRIVILEGE CONTROLS ══ */}
                    <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0, height: 'auto', minHeight: 'fit-content' }}>
                        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--color-bg-elevated)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-cyan)" strokeWidth="2.5">
                                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
                                </svg>
                                <span style={{ fontWeight: 650, fontSize: 14, color: 'var(--color-text-primary)' }}>
                                    Employee and External Middleman Privilege Control Pipeline
                                </span>
                            </div>
                            <span style={{ fontSize: 11, color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
                                Mitigates Vendor & Employee Insider Threats to Direct User Accounts
                            </span>
                        </div>

                        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                            {employees.map((emp) => {
                                const isHighRisk = emp.risk >= 70;
                                const isMediumRisk = emp.risk >= 40 && emp.risk < 70;
                                const badgeColor = isHighRisk ? 'var(--color-critical)' : isMediumRisk ? 'var(--color-medium)' : 'var(--color-low)';
                                const badgeBg = isHighRisk ? 'var(--color-critical-bg)' : isMediumRisk ? 'var(--color-medium-bg)' : 'var(--color-low-bg)';

                                // Text descriptor of privilege ranges
                                const getPrivilegeLabel = (lvl: number) => {
                                    if (lvl === 0) return 'Revoked (0%)';
                                    if (lvl <= 30) return `Restricted Access (${lvl}%)`;
                                    if (lvl <= 75) return `Monitored Workstage (${lvl}%)`;
                                    return `Full Trust Admin (${lvl}%)`;
                                };

                                return (
                                    <div
                                        key={emp.id}
                                        style={{
                                            padding: '16px',
                                            borderRadius: 8,
                                            border: '1px solid var(--color-border)',
                                            background: 'var(--color-bg-elevated)',
                                            display: 'grid',
                                            gridTemplateColumns: '220px 140px 1fr 280px',
                                            gap: 16,
                                            alignItems: 'center',
                                        }}
                                    >
                                        {/* Column 1: Info */}
                                        <div>
                                            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                                                {emp.name}
                                            </div>
                                            <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                                                {emp.role} · <strong style={{ color: 'var(--color-cyan)' }}>{emp.id}</strong>
                                            </div>
                                        </div>

                                        {/* Column 2: Threat Rating */}
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <span style={{
                                                    fontSize: 11,
                                                    fontWeight: 700,
                                                    padding: '2px 8px',
                                                    borderRadius: 4,
                                                    background: badgeBg,
                                                    color: badgeColor,
                                                    fontFamily: 'var(--font-mono)'
                                                }}>
                                                    {emp.risk}% RISK
                                                </span>
                                            </div>
                                            <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 2 }}>
                                                Access target: <strong>{emp.targetUser}</strong>
                                            </div>
                                        </div>

                                        {/* Column 3: Privilege Slider */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                                                    Privilege Allowance Level
                                                </span>
                                                <span style={{ fontSize: 11, fontWeight: 700, color: emp.access === 0 ? 'var(--color-critical)' : 'var(--color-text-primary)', fontFamily: 'var(--font-mono)' }}>
                                                    {getPrivilegeLabel(emp.access)}
                                                </span>
                                            </div>

                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <input
                                                    type="range"
                                                    min="0"
                                                    max="100"
                                                    step="5"
                                                    value={emp.access}
                                                    onChange={(e) => handleSliderChange(emp.id, parseInt(e.target.value))}
                                                    style={{
                                                        flex: 1,
                                                        accentColor: emp.access === 0 ? 'var(--color-critical)' : 'var(--color-cyan)',
                                                        cursor: 'pointer',
                                                    }}
                                                />
                                            </div>
                                        </div>

                                        {/* Column 4: Quick Action Controls */}
                                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                            <button
                                                onClick={() => handleSendThreatAlert(emp.id)}
                                                disabled={emp.alerted}
                                                style={{
                                                    padding: '6px 12px',
                                                    background: emp.alerted ? 'transparent' : 'rgba(249,115,22,0.1)',
                                                    color: emp.alerted ? 'var(--color-text-muted)' : 'var(--color-high)',
                                                    border: emp.alerted ? '1px dashed var(--color-border)' : '1px solid rgba(249,115,22,0.3)',
                                                    borderRadius: 6,
                                                    cursor: emp.alerted ? 'default' : 'pointer',
                                                    fontSize: 11,
                                                    fontWeight: 600,
                                                }}
                                            >
                                                {emp.alerted ? '✓ Alert Sent' : 'Warn Employee'}
                                            </button>

                                            <button
                                                onClick={() => handleSliderChange(emp.id, 0)}
                                                style={{
                                                    padding: '6px 12px',
                                                    background: 'rgba(239,68,68,0.1)',
                                                    color: 'var(--color-critical)',
                                                    border: '1px solid rgba(239,68,68,0.3)',
                                                    borderRadius: 6,
                                                    cursor: 'pointer',
                                                    fontSize: 11,
                                                    fontWeight: 500,
                                                }}
                                            >
                                                Revoke
                                            </button>

                                            <button
                                                onClick={() => handleApplyAccessPolicy(emp)}
                                                style={{
                                                    padding: '6px 12px',
                                                    background: 'var(--color-text-primary)',
                                                    color: 'var(--color-bg-surface)',
                                                    border: 'none',
                                                    borderRadius: 6,
                                                    cursor: 'pointer',
                                                    fontSize: 11,
                                                    fontWeight: 600,
                                                }}
                                            >
                                                Apply Policy
                                            </button>
                                        </div>

                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* ══ SECTION 2: SUSPICIOUS ACTIVITY & PRIORITY VECTOR CARDS ══ */}
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, alignItems: 'start' }}>

                        {/* Left: Urgent Suspicious Activities */}
                        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--color-text-primary)' }}>
                                    Active System Anomaly Warnings
                                </span>
                                <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: 'var(--color-critical-bg)', color: 'var(--color-critical)', fontFamily: 'var(--font-mono)' }}>
                                    CRITICAL FEEDS
                                </span>
                            </div>

                            <div style={{ padding: '8px 16px 16px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {criticalHighList.length === 0 ? (
                                    <div style={{ padding: '24px 0', color: 'var(--color-text-muted)', fontSize: 12, textAlign: 'center' }}>
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ margin: '0 auto 8px', display: 'block' }}>
                                            <circle cx="12" cy="12" r="10" /><path d="m9 12 2 2 4-4" />
                                        </svg>
                                        No high severity threat vectors require active intervention.
                                    </div>
                                ) : (
                                    criticalHighList.map((threat) => (
                                        <div
                                            key={threat.session_id}
                                            style={{
                                                padding: '12px',
                                                borderRadius: 8,
                                                border: '1px solid var(--color-border)',
                                                background: 'var(--color-bg-elevated)',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: 10
                                            }}
                                        >
                                            {/* Top Info row */}
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <span style={{
                                                        fontSize: 10,
                                                        padding: '2px 6px',
                                                        borderRadius: 4,
                                                        fontWeight: 600,
                                                        background: threat.risk_tier === 'CRITICAL' ? 'var(--color-critical-bg)' : 'var(--color-high-bg)',
                                                        color: threat.risk_tier === 'CRITICAL' ? 'var(--color-critical)' : 'var(--color-high)',
                                                    }}>
                                                        {threat.risk_tier}
                                                    </span>
                                                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                                                        {threat.user_id} · Session {threat.session_id.substring(0, 8)}
                                                    </span>
                                                </div>
                                                <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}>
                                                    Risk Score: <strong style={{ color: 'var(--color-text-primary)' }}>{Math.round(threat.fused_score * 100)}%</strong>
                                                </span>
                                            </div>

                                            {/* Detail row */}
                                            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                                                <div style={{ marginBottom: 4 }}>
                                                    Anomaly Reason: <strong>{threat.scenario_hints.join(', ') || 'Suspicious user session pattern detected.'}</strong>
                                                </div>
                                                <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}>
                                                    Vectors: gcn = {Math.round(threat.gcn_score * 100)}% · transformer = {Math.round(threat.transformer_score * 100)}% · latency = {threat.inference_latency_ms.toFixed(1)}ms
                                                </div>
                                            </div>

                                            {/* Action buttons row */}
                                            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                                                <button
                                                    onClick={() => handleMitigate(threat, 'ISOLATE')}
                                                    disabled={mitigatingId === threat.session_id}
                                                    style={{
                                                        padding: '6px 12px',
                                                        background: 'var(--color-critical-bg)',
                                                        color: 'var(--color-critical)',
                                                        border: '1px solid var(--color-critical-border)',
                                                        borderRadius: 4,
                                                        cursor: 'pointer',
                                                        fontSize: 11,
                                                        fontWeight: 600,
                                                        flex: 1
                                                    }}
                                                >
                                                    {mitigatingId === threat.session_id ? 'Mitigating...' : 'Avoid Threat (Isolate Host)'}
                                                </button>
                                                <button
                                                    onClick={() => handleMitigate(threat, 'ALERT_ANALYST')}
                                                    disabled={mitigatingId === threat.session_id}
                                                    style={{
                                                        padding: '6px 12px',
                                                        background: 'rgba(34,211,238,0.1)',
                                                        color: 'var(--color-cyan)',
                                                        border: '1px solid rgba(34,211,238,0.3)',
                                                        borderRadius: 4,
                                                        cursor: 'pointer',
                                                        fontSize: 11,
                                                        fontWeight: 500,
                                                        flex: 1
                                                    }}
                                                >
                                                    Sever Connection & Audit
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        {/* Right: Security checklist recommendations */}
                        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column' }}>
                            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border)' }}>
                                <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--color-text-primary)' }}>
                                    Mitigation Checklist
                                </span>
                            </div>
                            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                                {[
                                    { title: 'Check Active Handshakes', text: 'Confirm zero telemetry disconnects in SOC flow.' },
                                    { title: 'Verify PQC Encapsulation', text: 'Validate keywraps conform to post-quantum standards.' },
                                    { title: 'Audit Device Vectors', text: 'Mitigate hosts leaking high data transfers.' },
                                    { title: 'Rotate Session Store Key', text: 'Force session invalidation on critical host tags.' },
                                ].map((item, i) => (
                                    <div key={i} onClick={() => handleToggleCheck(i)} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
                                        <div style={{
                                            width: 14, height: 14, borderRadius: 3,
                                            border: '1px solid var(--color-border)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            background: checks[i] ? 'var(--color-cyan)' : 'transparent',
                                            color: 'var(--color-bg-surface)',
                                            flexShrink: 0,
                                            marginTop: 2,
                                            transition: 'all 0.15s ease'
                                        }}>
                                            {checks[i] && (
                                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                                    <polyline points="20 6 9 17 4 12" />
                                                </svg>
                                            )}
                                        </div>
                                        <div>
                                            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                                                {item.title}
                                            </div>
                                            <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                                                {item.text}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                    </div>

                    {/* Suspicious Event Stream Logs */}
                    <div className="glass-card" style={{ display: 'flex', flexDirection: 'column' }}>
                        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border)' }}>
                            <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--color-text-primary)' }}>
                                System-Wide Activity & Threat Vectors Log
                            </span>
                        </div>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'left' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-elevated)', color: 'var(--color-text-secondary)' }}>
                                        {['Severity', 'Session ID', 'Host', 'Vector Context', 'Anomaly Metrics'].map(th => (
                                            <th key={th} style={{ padding: '10px 16px', fontWeight: 600 }}>{th}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {threats.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} style={{ padding: '20px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                                                No system activity logged in telemetry buffer.
                                            </td>
                                        </tr>
                                    ) : (
                                        threats.map((threat, idx) => (
                                            <tr key={threat.session_id} style={{ borderBottom: '1px solid var(--color-border)', background: idx % 2 === 0 ? 'transparent' : 'var(--color-bg-elevated)' }}>
                                                <td style={{ padding: '10px 16px' }}>
                                                    <span style={{
                                                        fontSize: 10, padding: '2px 6px', borderRadius: 4, fontWeight: 600,
                                                        background: threat.risk_tier === 'CRITICAL' ? 'var(--color-critical-bg)' :
                                                            threat.risk_tier === 'HIGH' ? 'var(--color-high-bg)' :
                                                                threat.risk_tier === 'MEDIUM' ? 'var(--color-medium-bg)' : 'var(--color-low-bg)',
                                                        color: threat.risk_tier === 'CRITICAL' ? 'var(--color-critical)' :
                                                            threat.risk_tier === 'HIGH' ? 'var(--color-high)' :
                                                                threat.risk_tier === 'MEDIUM' ? 'var(--color-medium)' : 'var(--color-low)',
                                                    }}>
                                                        {threat.risk_tier}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{threat.session_id}</td>
                                                <td style={{ padding: '10px 16px', fontWeight: 500 }}>{threat.user_id}</td>
                                                <td style={{ padding: '10px 16px', color: 'var(--color-text-secondary)' }}>
                                                    {threat.scenario_hints.join(', ') || 'Anomalous network signatures detected.'}
                                                </td>
                                                <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-muted)' }}>
                                                    Score: {Math.round(threat.fused_score * 100)}% (Latency: {threat.inference_latency_ms.toFixed(1)}ms)
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                </div>

            </div>

            {/* ══ POLICY TRANSACTION VERIFICATION MODAL ══ */}
            {verifyingPolicy && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(9, 9, 11, 0.45)',
                    backdropFilter: 'blur(4px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 9999,
                }}>
                    <div className="glass-card" style={{ width: 440, padding: 24, display: 'flex', flexDirection: 'column', gap: 16, border: '1px solid var(--color-cyan)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div className="pulse-dot" style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--color-cyan)' }} />
                            <span style={{ fontWeight: 700, fontSize: 12, fontFamily: 'var(--font-mono)', letterSpacing: '0.05em', color: 'var(--color-cyan)', textTransform: 'uppercase' }}>
                                PQC Signature Generation
                            </span>
                        </div>

                        <div style={{ fontSize: 13, color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)', minHeight: 48 }}>
                            {signingLog}
                        </div>

                        {signedTxHash && (
                            <div style={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)', borderRadius: 6, padding: '10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <span style={{ fontSize: 9, textTransform: 'uppercase', fontWeight: 600, color: 'var(--color-text-muted)' }}>
                                    ML-DSA-87 Certificate Signature
                                </span>
                                <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-cyan)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {signedTxHash}
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
