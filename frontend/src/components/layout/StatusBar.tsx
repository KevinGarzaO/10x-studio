'use client';

interface AvocadoStatusBarProps {
  postsScheduled?: number;
  drafts?: number;
  credits?: number;
  userName?: string;
  userInitials?: string;
  roles?: string[];
}

export default function AvocadoStatusBar({ 
  postsScheduled = 3, 
  drafts = 2, 
  credits = 968,
  userName = 'Kevin Garza',
  userInitials = 'KG',
  roles = ['Founder']
}: AvocadoStatusBarProps) {
  return (
    <div className="statusbar">
      <div className="statusbar-left">
        <div className="ai-status" style={{ padding: '2px 8px', background: 'transparent', border: 'none' }}>
          <span className="dot"></span>
          <span style={{ color: '#4ECCA3' }}>Claude Haiku 4.5 — Online & Listo</span>
        </div>
        
        <div className="divider"></div>
        
        <span>{postsScheduled} posts · {drafts} drafts</span>
      </div>

      <div className="statusbar-right">
        <div className="statusbar-user">
          <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'linear-gradient(135deg, #4ECCA3, #10B981)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 600, color: '#0A0E1A' }}>
            {userInitials}
          </div>
          <span>{userName}</span>
          {roles.map((role) => (
            <span key={role} className="role-badge">{role}</span>
          ))}
        </div>

        <button 
          style={{ 
            background: 'transparent', 
            border: 'none', 
            color: '#EF4444', 
            cursor: 'pointer', 
            fontSize: '11px',
            padding: '4px 8px',
            borderRadius: '4px',
            fontFamily: 'inherit'
          }}
          onMouseOver={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'}
          onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
        >
          Cerrar Sesión
        </button>
      </div>
    </div>
  );
}