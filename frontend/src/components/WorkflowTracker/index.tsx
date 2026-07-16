'use client';

interface Props {
  currentStep: number;   // 1–11
  alertStep?: 11 | null; // lights up step 11 when session revoked
  sessionCount: number;  // count of CRITICAL/HIGH sessions
}

const STEPS = [
  'Access Request',
  'Risk Profiling',
  'MFA/Authorize',
  'PQC Credentials',
  'Session Broker',
  'Isolated Session',
  'Telemetry Stream',
  'Baseline Analysis',
  'ANOMALY DETECTED',
  'Alert/Contain',
  'Session Revoked',
] as const;

type StepStatus = 'complete' | 'active' | 'alert' | 'amber' | 'pending';

function getStatus(stepIdx: number, currentStep: number, alertStep: number | null | undefined): StepStatus {
  const n = stepIdx + 1; // 1-based
  if (n === 9 && currentStep >= 9) return 'alert';
  if (n === 10 && currentStep >= 10) return 'amber';
  if (n === 11 && alertStep === 11)  return 'complete';
  if (n < currentStep)  return 'complete';
  if (n === currentStep) return 'active';
  return 'pending';
}

const STATUS_COLOR: Record<StepStatus, string> = {
  complete: '#22c55e',
  active:   '#22d3ee',
  alert:    '#ef4444',
  amber:    '#f59e0b',
  pending:  '#2d3748',
};

export default function WorkflowTracker({ currentStep, alertStep, sessionCount }: Props) {
  return (
    <div style={{
      flexShrink: 0,
      padding: '8px 14px',
      background: 'rgba(7,11,20,0.6)',
      backdropFilter: 'blur(12px)',
      borderBottom: '1px solid rgba(34,211,238,0.07)',
      display: 'flex', alignItems: 'center', gap: 6,
      overflowX: 'auto',
    }}>
      {/* Label */}
      <span style={{
        fontSize: 8, fontFamily: 'JetBrains Mono, monospace',
        color: 'var(--color-text-muted)', flexShrink: 0, marginRight: 4, letterSpacing: '0.08em',
      }}>
        WORKFLOW
      </span>

      {STEPS.map((label, i) => {
        const status = getStatus(i, currentStep, alertStep);
        const color  = STATUS_COLOR[status];
        const isLast = i === STEPS.length - 1;

        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            {/* Circle */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
              <div
                className={`step-circle workflow-step-${status}`}
                style={{
                  width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                  border: `1.5px solid ${color}`,
                  background: status === 'complete' ? color
                            : status === 'alert'    ? color
                            : status === 'amber'    ? color
                            : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 200ms ease',
                  boxShadow: (status === 'active' || status === 'alert' || status === 'amber')
                    ? `0 0 10px ${color}88` : 'none',
                  animation: status === 'active' ? 'step-pulse 1.5s ease-in-out infinite' : 'none',
                }}>
                {status === 'complete' && (
                  <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="#04070d" strokeWidth="3.5">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                )}
              </div>
              <span style={{
                fontSize: 7, fontFamily: 'JetBrains Mono, monospace',
                color, whiteSpace: 'nowrap', transition: 'color 200ms',
                fontWeight: status === 'active' || status === 'alert' ? 700 : 400,
                maxWidth: 60, textAlign: 'center', lineHeight: 1.1,
              }}>
                {label}
              </span>
            </div>

            {/* Connector line between steps */}
            {!isLast && (
              <div style={{
                width: 18, height: 1, flexShrink: 0,
                background: status === 'complete' ? 'rgba(34,197,94,0.5)'
                          : status === 'alert'    ? 'rgba(239,68,68,0.5)'
                          : 'rgba(255,255,255,0.06)',
                transition: 'background 300ms', margin: '0 1px 14px',
              }} />
            )}
          </div>
        );
      })}

      {/* Session count badge */}
      <div style={{ marginLeft: 'auto', flexShrink: 0 }}>
        <span style={{
          fontSize: 9, fontFamily: 'JetBrains Mono, monospace',
          color: 'var(--color-text-muted)', padding: '2px 8px',
          border: '1px solid var(--color-border)', borderRadius: 4,
        }}>
          {sessionCount} monitored
        </span>
      </div>
    </div>
  );
}
