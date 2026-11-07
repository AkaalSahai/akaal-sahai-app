import ProjectorSettings from '../components/ProjectorSettings'
import ProjectorImages from '../components/ProjectorImages'

// "Projector" tab for Projector Managers (agreed 07-11-2026): only the two
// projector sections of Settings - nothing else. The database lets them write
// only the projector settings and pictures (supabase/projector-manager.sql).
export default function ProjectorManage() {
  return (
    <div>
      <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--primary)' }}>Projector</div>
          <div style={{ fontSize: '.8rem', color: 'var(--muted)', marginTop: 2 }}>
            Change what the projector screen shows. Changes appear on the projector within about 30 seconds.
          </div>
        </div>
        <a className="btn btn-outline btn-sm" href="/projector" target="_blank" rel="noopener noreferrer">
          Open projector screen ↗
        </a>
      </div>
      <ProjectorSettings />
      <ProjectorImages />
    </div>
  )
}
