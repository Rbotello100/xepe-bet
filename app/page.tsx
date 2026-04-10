import { supabase } from '../lib/supabase'

export default async function Home() {
  const { data: matches } = await supabase
    .from('matches')
    .select('*')
    .order('starts_at')

  return (
    <main style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '1.5rem' }}>
        ⚽ Mundial Betting
      </h1>

      {matches?.map(match => (
        <div key={match.id} style={{
          border: '1px solid #e5e5e5',
          borderRadius: '12px',
          padding: '1rem',
          marginBottom: '1rem'
        }}>
          <p style={{ fontSize: '12px', color: '#888', marginBottom: '8px' }}>
            Grupo {match.group_name} — {match.status}
          </p>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{match.home_flag} {match.home_team}</span>
            <span style={{ color: '#888' }}>vs</span>
            <span>{match.away_team} {match.away_flag}</span>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '1rem' }}>
            <button style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid #e5e5e5', cursor: 'pointer' }}>
              1 — {match.odd_home}
            </button>
            <button style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid #e5e5e5', cursor: 'pointer' }}>
              X — {match.odd_draw}
            </button>
            <button style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid #e5e5e5', cursor: 'pointer' }}>
              2 — {match.odd_away}
            </button>
          </div>
        </div>
      ))}
    </main>
  )
}