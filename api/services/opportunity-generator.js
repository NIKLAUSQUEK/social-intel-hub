/**
 * Opportunity Generator Service
 * Generates actionable opportunities from classifications and performance data:
 * - Growth plays (best hook x best content combo)
 * - Content gaps (underused high-performing types)
 * - Low ROI alerts
 * - Repurpose suggestions
 * - Hook retirement warnings
 */

/**
 * Generate opportunities from classification and performance data
 * @param {Array} contentPerf - Content type performance matrix
 * @param {Array} hookPerf - Hook performance rankings
 * @param {Array} classifications - Post classifications
 * @param {Object} healthScore - Client health score object
 * @returns {Array} Opportunity objects
 */
export function generateOpportunities(contentPerf, hookPerf, classifications, healthScore) {
  const opportunities = [];

  // 1. Growth Play: best hook x best content combo
  if (hookPerf.length > 0 && contentPerf.length > 0) {
    const bestHook = hookPerf[0];
    const bestContent = contentPerf[0];
    opportunities.push({
      opportunity_type: 'growth_play',
      title: `Winning combo: ${bestHook.hook_type} + ${bestContent.content_type}`,
      description: `Your best-performing hook type "${bestHook.hook_type}" (${bestHook.avg_engagement_rate}% eng rate) paired with your top content type "${bestContent.content_type}" (${bestContent.performance_index} perf index) could amplify results.`,
      action_text: `Create 3 ${bestContent.content_type} posts using ${bestHook.hook_type} hooks this week`,
      priority: 1,
      accent_color: '#22C55E',
      icon: '🚀',
      supporting_data: { bestHook, bestContent },
    });
  }

  // 2. Content Gaps: types with high performance but low usage
  for (const ct of contentPerf) {
    if (parseFloat(ct.post_percentage) < 10 && parseFloat(ct.performance_index) > 0) {
      const avgPerfIndex = contentPerf.reduce((s, c) => s + parseFloat(c.performance_index), 0) / contentPerf.length;
      if (parseFloat(ct.performance_index) > avgPerfIndex) {
        opportunities.push({
          opportunity_type: 'content_gap',
          title: `Underused gold: ${ct.content_type}`,
          description: `"${ct.content_type}" content is only ${ct.post_percentage}% of your posts but outperforms average (perf index ${ct.performance_index} vs avg ${avgPerfIndex.toFixed(2)}). You're leaving engagement on the table.`,
          action_text: `Increase ${ct.content_type} posts to at least 20% of your content mix`,
          priority: 2,
          accent_color: '#F59E0B',
          icon: '💡',
          supporting_data: { contentType: ct },
        });
      }
    }
  }

  // 3. Low ROI Alert: content types with high usage but low performance
  for (const ct of contentPerf) {
    if (parseFloat(ct.post_percentage) > 30 && parseFloat(ct.performance_index) < 1) {
      opportunities.push({
        opportunity_type: 'low_roi',
        title: `Diminishing returns: ${ct.content_type}`,
        description: `"${ct.content_type}" makes up ${ct.post_percentage}% of your content but has a low performance index (${ct.performance_index}). Consider diversifying.`,
        action_text: `Reduce ${ct.content_type} posts and reallocate to higher-performing types`,
        priority: 3,
        accent_color: '#EF4444',
        icon: '⚠️',
        supporting_data: { contentType: ct },
      });
    }
  }

  // 4. Repurpose Suggestions: high-performing posts that could be adapted
  if (classifications && classifications.length > 0) {
    const topSentiment = classifications
      .filter(c => (c.sentiment_score || 0) > 75)
      .slice(0, 3);

    if (topSentiment.length > 0) {
      opportunities.push({
        opportunity_type: 'repurpose',
        title: 'Repurpose your top-sentiment content',
        description: `${topSentiment.length} post(s) scored 75+ sentiment. Turn these into carousels, threads, or short clips for cross-platform reach.`,
        action_text: 'Create carousel or thread versions of your highest-sentiment posts',
        priority: 4,
        accent_color: '#8B5CF6',
        icon: '♻️',
        supporting_data: { posts: topSentiment.map(c => c.post_id) },
      });
    }
  }

  // 5. Hook Retirement Warning: hooks with low engagement
  for (const h of hookPerf) {
    if (h.use_count >= 3 && parseFloat(h.avg_engagement_rate) < 1) {
      opportunities.push({
        opportunity_type: 'hook_retire',
        title: `Consider retiring: "${h.hook_type}" hooks`,
        description: `You've used "${h.hook_type}" ${h.use_count} times but it averages only ${h.avg_engagement_rate}% engagement. Try swapping it for higher-performing alternatives.`,
        action_text: `Replace "${h.hook_type}" with "${hookPerf[0]?.hook_type || 'question'}" hooks in your next 3 posts`,
        priority: 5,
        accent_color: '#94A3B8',
        icon: '🔄',
        supporting_data: { hook: h },
      });
    }
  }

  // 6. Health-based opportunity
  if (healthScore && healthScore.health_score < 50) {
    const weakest = Object.entries(healthScore.score_breakdown || {})
      .sort((a, b) => a[1] - b[1])[0];
    if (weakest) {
      opportunities.push({
        opportunity_type: 'health_alert',
        title: `Focus area: ${weakest[0]}`,
        description: `Your overall health score is ${healthScore.health_score}/100. The weakest area is "${weakest[0]}" at ${weakest[1]}/100. Improving this will have the biggest impact.`,
        action_text: `Prioritise improving ${weakest[0]} this week`,
        priority: 1,
        accent_color: '#EF4444',
        icon: '🏥',
        supporting_data: { healthScore },
      });
    }
  }

  return opportunities.sort((a, b) => a.priority - b.priority);
}
