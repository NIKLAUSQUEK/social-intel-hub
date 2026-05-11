import React, { useState, useEffect, useMemo } from 'react';

// ─── Configuration ───────────────────────────────────────────
const API_BASE = typeof window !== 'undefined' && window.SOCIAL_INTEL_API
  ? window.SOCIAL_INTEL_API
  : 'http://localhost:3099/api';

// ─── Utility helpers ─────────────────────────────────────────
function formatNumber(n) {
  if (n == null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function platformIcon(platform) {
  const icons = { instagram: '📸', tiktok: '🎵', facebook: '👥' };
  return icons[platform] || '📊';
}

function platformColour(platform) {
  const colours = {
    instagram: '#E1306C',
    tiktok: '#00f2ea',
    facebook: '#1877F2',
  };
  return colours[platform] || '#888';
}

// ─── Hooks ───────────────────────────────────────────────────
function useFetch(url) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!url) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(url)
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        if (json.success) setData(json.data);
        else setError(json.error || 'Unknown error');
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message);
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [url]);

  return { data, loading, error };
}

// ─── Sub-components ──────────────────────────────────────────

function ClientSelector({ clients, selectedId, onSelect }) {
  return (
    <div style={styles.selectorWrap}>
      <label style={styles.selectorLabel}>Client</label>
      <select
        style={styles.selector}
        value={selectedId || ''}
        onChange={(e) => onSelect(e.target.value)}
      >
        {clients.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
    </div>
  );
}

function StatCard({ label, value, sub, colour }) {
  return (
    <div style={{ ...styles.statCard, borderTop: `3px solid ${colour || '#555'}` }}>
      <div style={styles.statValue}>{value}</div>
      <div style={styles.statLabel}>{label}</div>
      {sub && <div style={styles.statSub}>{sub}</div>}
    </div>
  );
}

function PlatformSection({ platform, data }) {
  if (!data || !data.success) {
    return (
      <div style={styles.platformCard}>
        <h3 style={styles.platformTitle}>
          {platformIcon(platform)} {platform.charAt(0).toUpperCase() + platform.slice(1)}
        </h3>
        <p style={styles.errorText}>
          {data?.error || 'No data available'}
        </p>
      </div>
    );
  }

  const colour = platformColour(platform);

  return (
    <div style={{ ...styles.platformCard, borderLeft: `4px solid ${colour}` }}>
      <h3 style={styles.platformTitle}>
        {platformIcon(platform)} {platform.charAt(0).toUpperCase() + platform.slice(1)}
        {data.displayName && <span style={styles.displayName}> — {data.displayName}</span>}
      </h3>
      <div style={styles.statsRow}>
        <StatCard
          label="Followers"
          value={formatNumber(data.followers)}
          colour={colour}
        />
        {platform === 'instagram' && (
          <>
            <StatCard label="Posts" value={formatNumber(data.posts)} colour={colour} />
            <StatCard label="Following" value={formatNumber(data.following)} colour={colour} />
          </>
        )}
        {platform === 'tiktok' && (
          <>
            <StatCard label="Total Likes" value={formatNumber(data.likes)} colour={colour} />
            <StatCard label="Following" value={formatNumber(data.following)} colour={colour} />
          </>
        )}
        {platform === 'facebook' && (
          <>
            <StatCard label="Page Likes" value={formatNumber(data.pageLikes)} colour={colour} />
            <StatCard label="Category" value={data.category || '—'} colour={colour} />
          </>
        )}
      </div>
      {data.note && <p style={styles.noteText}>ℹ️ {data.note}</p>}
    </div>
  );
}

function TopPosts({ posts }) {
  if (!posts) return null;

  const allPosts = [];
  for (const [platform, platformPosts] of Object.entries(posts.platforms || {})) {
    for (const post of platformPosts) {
      allPosts.push({ ...post, platform });
    }
  }

  if (allPosts.length === 0) {
    return (
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>📝 Recent Posts</h2>
        <p style={styles.muted}>No posts scraped yet.</p>
      </div>
    );
  }

  // Sort by engagement (likes + comments + reactions + views)
  allPosts.sort((a, b) => {
    const scoreA = (a.likes || 0) + (a.comments || 0) + (a.reactions || 0) + (a.views || 0);
    const scoreB = (b.likes || 0) + (b.comments || 0) + (b.reactions || 0) + (b.views || 0);
    return scoreB - scoreA;
  });

  return (
    <div style={styles.section}>
      <h2 style={styles.sectionTitle}>📝 Top Posts</h2>
      <div style={styles.postsGrid}>
        {allPosts.slice(0, 12).map((post, i) => (
          <div key={i} style={styles.postCard}>
            <div style={styles.postHeader}>
              <span style={{ color: platformColour(post.platform) }}>
                {platformIcon(post.platform)}
              </span>
              <span style={styles.postPlatform}>
                {post.platform}
              </span>
            </div>
            {post.thumbnail && (
              <img
                src={post.thumbnail}
                alt=""
                style={styles.postThumb}
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            )}
            <p style={styles.postCaption}>
              {(post.caption || '').slice(0, 120)}
              {(post.caption || '').length > 120 ? '…' : ''}
            </p>
            <div style={styles.postStats}>
              {post.likes != null && <span>❤️ {formatNumber(post.likes)}</span>}
              {post.comments != null && <span>💬 {formatNumber(post.comments)}</span>}
              {post.reactions != null && <span>👍 {formatNumber(post.reactions)}</span>}
              {post.views != null && <span>👁️ {formatNumber(post.views)}</span>}
              {post.shares != null && <span>🔄 {formatNumber(post.shares)}</span>}
            </div>
            {post.url && (
              <a href={post.url} target="_blank" rel="noopener noreferrer" style={styles.postLink}>
                View →
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function HistoryChart({ history }) {
  if (!history) return null;

  const snapshots = history.scrapeHistory || [];
  const wayback = history.waybackHistory || {};

  // Merge all data points into a timeline
  const timeline = [];

  for (const snap of snapshots) {
    timeline.push({
      date: snap.date,
      source: 'scrape',
      instagram: snap.instagram?.followers || 0,
      tiktok: snap.tiktok?.followers || 0,
      facebook: snap.facebook?.followers || 0,
    });
  }

  // Add wayback data
  for (const [platform, points] of Object.entries(wayback)) {
    for (const point of points) {
      const existing = timeline.find((t) => t.date === point.date);
      if (existing) {
        existing[platform] = point.followers || existing[platform];
        existing.source = 'merged';
      } else {
        timeline.push({
          date: point.date,
          source: 'wayback',
          [platform]: point.followers || 0,
        });
      }
    }
  }

  timeline.sort((a, b) => a.date.localeCompare(b.date));

  if (timeline.length === 0) {
    return (
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>📈 Follower Growth</h2>
        <p style={styles.muted}>No historical data yet. Run the scraper multiple times to build up history.</p>
      </div>
    );
  }

  // Simple text-based chart (no external charting lib needed)
  const maxFollowers = Math.max(
    ...timeline.map((t) => Math.max(t.instagram || 0, t.tiktok || 0, t.facebook || 0))
  );

  return (
    <div style={styles.section}>
      <h2 style={styles.sectionTitle}>📈 Follower Growth</h2>
      <div style={styles.chartTable}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Date</th>
              <th style={{ ...styles.th, color: platformColour('instagram') }}>Instagram</th>
              <th style={{ ...styles.th, color: platformColour('tiktok') }}>TikTok</th>
              <th style={{ ...styles.th, color: platformColour('facebook') }}>Facebook</th>
              <th style={styles.th}>Source</th>
            </tr>
          </thead>
          <tbody>
            {timeline.map((row, i) => (
              <tr key={i} style={i % 2 === 0 ? styles.trEven : styles.trOdd}>
                <td style={styles.td}>{row.date}</td>
                <td style={styles.td}>{row.instagram ? formatNumber(row.instagram) : '—'}</td>
                <td style={styles.td}>{row.tiktok ? formatNumber(row.tiktok) : '—'}</td>
                <td style={styles.td}>{row.facebook ? formatNumber(row.facebook) : '—'}</td>
                <td style={styles.tdMuted}>{row.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Simple bar visualisation */}
      <div style={styles.barChart}>
        {timeline.slice(-10).map((row, i) => {
          const igPct = maxFollowers > 0 ? ((row.instagram || 0) / maxFollowers) * 100 : 0;
          const ttPct = maxFollowers > 0 ? ((row.tiktok || 0) / maxFollowers) * 100 : 0;
          const fbPct = maxFollowers > 0 ? ((row.facebook || 0) / maxFollowers) * 100 : 0;

          return (
            <div key={i} style={styles.barGroup}>
              <div style={styles.barLabel}>{row.date.slice(5)}</div>
              <div style={styles.barRow}>
                <div style={{ ...styles.bar, width: `${igPct}%`, background: platformColour('instagram') }} title={`IG: ${formatNumber(row.instagram)}`} />
              </div>
              <div style={styles.barRow}>
                <div style={{ ...styles.bar, width: `${ttPct}%`, background: platformColour('tiktok') }} title={`TT: ${formatNumber(row.tiktok)}`} />
              </div>
              <div style={styles.barRow}>
                <div style={{ ...styles.bar, width: `${fbPct}%`, background: platformColour('facebook') }} title={`FB: ${formatNumber(row.facebook)}`} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ReportSummary({ report }) {
  if (!report) return null;

  return (
    <div style={styles.section}>
      <h2 style={styles.sectionTitle}>📋 Weekly Report</h2>
      <div style={styles.reportMeta}>
        <span>Week of {report.weekOf}</span>
        <span style={styles.muted}>Generated {formatDate(report.generatedAt)}</span>
      </div>
      <div style={styles.statsRow}>
        <StatCard
          label="Total Followers"
          value={formatNumber(report.summary?.totalFollowers)}
          colour="#10b981"
        />
        <StatCard
          label="Total Engagement"
          value={formatNumber(report.summary?.totalEngagement)}
          colour="#f59e0b"
        />
        <StatCard
          label="Platforms Scraped"
          value={report.summary?.platformsScraped || 0}
          colour="#6366f1"
        />
        <StatCard
          label="Failures"
          value={report.summary?.platformsFailed || 0}
          colour={report.summary?.platformsFailed > 0 ? '#ef4444' : '#22c55e'}
        />
      </div>

      {/* Strategy recommendations */}
      <div style={styles.strategyBox}>
        <h3 style={styles.strategyTitle}>🎯 Strategy Notes</h3>
        <StrategyRecommendations report={report} />
      </div>
    </div>
  );
}

function StrategyRecommendations({ report }) {
  const recommendations = useMemo(() => {
    if (!report?.platforms) return [];

    const recs = [];
    const platforms = report.platforms;

    // Cross-platform analysis
    const followerCounts = {};
    for (const [p, data] of Object.entries(platforms)) {
      if (data.status === 'success') {
        followerCounts[p] = data.followers || 0;
      }
    }

    const sorted = Object.entries(followerCounts).sort(([, a], [, b]) => b - a);
    if (sorted.length > 1) {
      const [strongest] = sorted[0];
      const [weakest] = sorted[sorted.length - 1];
      recs.push(
        `Strongest platform: ${strongest} (${formatNumber(followerCounts[strongest])} followers). ` +
        `Consider cross-promoting to grow ${weakest} (${formatNumber(followerCounts[weakest])}).`
      );
    }

    // Engagement insights
    for (const [p, data] of Object.entries(platforms)) {
      if (data.status === 'success' && data.followers > 0 && data.engagement > 0) {
        const rate = ((data.engagement / data.postsScraped) / data.followers * 100).toFixed(2);
        recs.push(
          `${p.charAt(0).toUpperCase() + p.slice(1)} engagement rate: ~${rate}% per post. ` +
          `${parseFloat(rate) > 3 ? 'Strong engagement!' : 'Consider testing different content formats.'}`
        );
      }
    }

    // Platform-specific tips
    if (platforms.tiktok?.status === 'success' && platforms.tiktok.followers < 10000) {
      recs.push('TikTok under 10K: focus on trending sounds and hashtags to boost discovery.');
    }

    if (platforms.instagram?.status === 'success') {
      recs.push('Instagram: prioritise Reels for algorithm reach. Carousel posts drive saves.');
    }

    if (platforms.facebook?.status === 'success') {
      recs.push('Facebook: focus on community engagement — polls, questions, and live sessions drive reach.');
    }

    if (recs.length === 0) {
      recs.push('Run the scraper to collect data before generating strategy recommendations.');
    }

    return recs;
  }, [report]);

  return (
    <ul style={styles.strategyList}>
      {recommendations.map((rec, i) => (
        <li key={i} style={styles.strategyItem}>{rec}</li>
      ))}
    </ul>
  );
}

// ─── Main component ──────────────────────────────────────────

export default function SocialTracker() {
  const [selectedClientId, setSelectedClientId] = useState(null);

  // Fetch clients list
  const { data: clients, loading: loadingClients, error: clientsError } = useFetch(
    `${API_BASE}/clients`
  );

  // Auto-select first client
  useEffect(() => {
    if (clients && clients.length > 0 && !selectedClientId) {
      setSelectedClientId(clients[0].id);
    }
  }, [clients, selectedClientId]);

  // Fetch data for selected client
  const { data: metrics, loading: loadingMetrics } = useFetch(
    selectedClientId ? `${API_BASE}/clients/${selectedClientId}/metrics` : null
  );
  const { data: history, loading: loadingHistory } = useFetch(
    selectedClientId ? `${API_BASE}/clients/${selectedClientId}/history` : null
  );
  const { data: posts, loading: loadingPosts } = useFetch(
    selectedClientId ? `${API_BASE}/clients/${selectedClientId}/posts` : null
  );
  const { data: report, loading: loadingReport } = useFetch(
    selectedClientId ? `${API_BASE}/clients/${selectedClientId}/report` : null
  );

  const selectedClient = clients?.find((c) => c.id === selectedClientId);
  const isLoading = loadingClients || loadingMetrics || loadingHistory || loadingPosts || loadingReport;

  if (loadingClients) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>Loading clients…</div>
      </div>
    );
  }

  if (clientsError) {
    return (
      <div style={styles.container}>
        <div style={styles.errorBox}>
          <h2>Failed to load clients</h2>
          <p>{clientsError}</p>
          <p style={styles.muted}>
            Make sure the API server is running: <code>npm run api</code>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>Social Intel</h1>
          <p style={styles.subtitle}>Multi-client social media analytics</p>
        </div>
        {clients && clients.length > 0 && (
          <ClientSelector
            clients={clients}
            selectedId={selectedClientId}
            onSelect={setSelectedClientId}
          />
        )}
      </header>

      {/* Client info bar */}
      {selectedClient && (
        <div style={styles.clientBar}>
          <span style={styles.clientName}>{selectedClient.name}</span>
          {metrics?.scrapedAt && (
            <span style={styles.lastScrape}>
              Last scraped: {formatDate(metrics.scrapedAt)}
            </span>
          )}
          {isLoading && <span style={styles.loadingBadge}>Refreshing…</span>}
        </div>
      )}

      {/* Platform metrics */}
      {metrics?.platforms && (
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>📊 Platform Metrics</h2>
          <div style={styles.platformGrid}>
            {Object.entries(metrics.platforms).map(([platform, data]) => (
              <PlatformSection key={platform} platform={platform} data={data} />
            ))}
          </div>
        </div>
      )}

      {/* Follower growth history */}
      <HistoryChart history={history} />

      {/* Top posts */}
      <TopPosts posts={posts} />

      {/* Weekly report & strategy */}
      <ReportSummary report={report} />

      {/* Footer */}
      <footer style={styles.footer}>
        <p>Social Intel Tracker — data refreshed by scraper</p>
      </footer>
    </div>
  );
}

// ─── Styles (dark theme, inline) ─────────────────────────────
const styles = {
  container: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    background: '#0f1117',
    color: '#e0e0e0',
    minHeight: '100vh',
    padding: '24px',
    maxWidth: '1200px',
    margin: '0 auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
    borderBottom: '1px solid #1e2130',
    paddingBottom: '16px',
  },
  title: {
    fontSize: '28px',
    fontWeight: '700',
    color: '#fff',
    margin: 0,
  },
  subtitle: {
    fontSize: '14px',
    color: '#888',
    marginTop: '4px',
  },
  selectorWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  selectorLabel: {
    fontSize: '14px',
    color: '#888',
  },
  selector: {
    background: '#1a1d2e',
    color: '#e0e0e0',
    border: '1px solid #2a2d3e',
    borderRadius: '8px',
    padding: '8px 12px',
    fontSize: '14px',
    cursor: 'pointer',
    minWidth: '200px',
  },
  clientBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    background: '#1a1d2e',
    borderRadius: '8px',
    padding: '12px 16px',
    marginBottom: '24px',
  },
  clientName: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#fff',
  },
  lastScrape: {
    fontSize: '13px',
    color: '#888',
  },
  loadingBadge: {
    fontSize: '12px',
    color: '#f59e0b',
    background: '#f59e0b22',
    padding: '2px 8px',
    borderRadius: '12px',
  },
  section: {
    marginBottom: '32px',
  },
  sectionTitle: {
    fontSize: '20px',
    fontWeight: '600',
    color: '#fff',
    marginBottom: '16px',
  },
  platformGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
    gap: '16px',
  },
  platformCard: {
    background: '#1a1d2e',
    borderRadius: '12px',
    padding: '20px',
  },
  platformTitle: {
    fontSize: '16px',
    fontWeight: '600',
    margin: '0 0 16px 0',
    color: '#fff',
  },
  displayName: {
    fontWeight: '400',
    color: '#888',
    fontSize: '14px',
  },
  statsRow: {
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap',
  },
  statCard: {
    background: '#12141f',
    borderRadius: '8px',
    padding: '12px 16px',
    flex: '1',
    minWidth: '80px',
  },
  statValue: {
    fontSize: '22px',
    fontWeight: '700',
    color: '#fff',
  },
  statLabel: {
    fontSize: '12px',
    color: '#888',
    marginTop: '4px',
  },
  statSub: {
    fontSize: '11px',
    color: '#666',
    marginTop: '2px',
  },
  noteText: {
    fontSize: '12px',
    color: '#f59e0b',
    marginTop: '12px',
  },
  errorText: {
    fontSize: '14px',
    color: '#ef4444',
  },
  muted: {
    color: '#666',
    fontSize: '14px',
  },
  // Posts
  postsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
    gap: '16px',
  },
  postCard: {
    background: '#1a1d2e',
    borderRadius: '12px',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  postHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '13px',
  },
  postPlatform: {
    color: '#888',
    textTransform: 'capitalize',
  },
  postThumb: {
    width: '100%',
    borderRadius: '8px',
    maxHeight: '180px',
    objectFit: 'cover',
  },
  postCaption: {
    fontSize: '13px',
    color: '#ccc',
    lineHeight: '1.4',
    margin: 0,
  },
  postStats: {
    display: 'flex',
    gap: '12px',
    fontSize: '13px',
    color: '#888',
    flexWrap: 'wrap',
  },
  postLink: {
    fontSize: '13px',
    color: '#6366f1',
    textDecoration: 'none',
  },
  // History chart
  chartTable: {
    overflowX: 'auto',
    marginBottom: '24px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '14px',
  },
  th: {
    textAlign: 'left',
    padding: '8px 12px',
    borderBottom: '1px solid #2a2d3e',
    color: '#888',
    fontWeight: '600',
  },
  td: {
    padding: '8px 12px',
    borderBottom: '1px solid #1a1d2e',
  },
  tdMuted: {
    padding: '8px 12px',
    borderBottom: '1px solid #1a1d2e',
    color: '#555',
    fontSize: '12px',
  },
  trEven: { background: '#12141f' },
  trOdd: { background: '#0f1117' },
  barChart: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  barGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  barLabel: {
    fontSize: '11px',
    color: '#666',
    marginBottom: '2px',
  },
  barRow: {
    height: '8px',
    background: '#1a1d2e',
    borderRadius: '4px',
    overflow: 'hidden',
  },
  bar: {
    height: '100%',
    borderRadius: '4px',
    transition: 'width 0.3s ease',
    minWidth: '2px',
  },
  // Report
  reportMeta: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '16px',
    fontSize: '14px',
  },
  strategyBox: {
    background: '#1a1d2e',
    borderRadius: '12px',
    padding: '20px',
    marginTop: '16px',
  },
  strategyTitle: {
    fontSize: '16px',
    fontWeight: '600',
    margin: '0 0 12px 0',
    color: '#fff',
  },
  strategyList: {
    margin: 0,
    paddingLeft: '20px',
  },
  strategyItem: {
    fontSize: '14px',
    lineHeight: '1.6',
    color: '#ccc',
    marginBottom: '8px',
  },
  // General
  loading: {
    textAlign: 'center',
    padding: '60px',
    color: '#888',
    fontSize: '16px',
  },
  errorBox: {
    textAlign: 'center',
    padding: '40px',
    background: '#1a1d2e',
    borderRadius: '12px',
    color: '#ef4444',
  },
  footer: {
    textAlign: 'center',
    padding: '24px',
    color: '#444',
    fontSize: '13px',
    borderTop: '1px solid #1e2130',
    marginTop: '32px',
  },
};
