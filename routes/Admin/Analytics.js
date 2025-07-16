const express = require('express');
const router = express.Router();
const { db } = require('../../handlers/db');
const { isAdmin } = require('../../utils/isAdmin');

router.get('/admin/analytics', isAdmin, async (req, res) => {
  try {
    const analytics = await db.get('analytics') || [];

    const pageViews = analytics.reduce((acc, item) => {
      acc[item.path] = (acc[item.path] || 0) + 1;
      return acc;
    }, {});

    const methodCounts = analytics.reduce((acc, item) => {
      acc[item.method] = (acc[item.method] || 0) + 1;
      return acc;
    }, {});

    const timeSeriesData = analytics.map(item => ({
      timestamp: item.timestamp,
      path: item.path
    }));

    res.render('admin/analytics', {
      req,
      user: req.user,
      pageViews,
      methodCounts,
      timeSeriesData,
    });
  } catch (err) {
    console.error('Error loading analytics:', err);
    res.status(500).render('error', { message: 'Error loading analytics' });
  }
});

router.get('/api/analytics', isAdmin, async (req, res) => {
  try {
    const analytics = await db.get('analytics') || [];

    const totalRequests = analytics.length;
    const uniqueVisitors = new Set(analytics.map(item => item.ip)).size;
    const avgRequestsPerHour = totalRequests / 24; // Podrías hacer esto más dinámico

    const pageCounts = analytics.reduce((acc, item) => {
      acc[item.path] = (acc[item.path] || 0) + 1;
      return acc;
    }, {});

    const sortedPages = Object.entries(pageCounts).sort((a, b) => b[1] - a[1]);
    const topPage = sortedPages.length > 0 ? sortedPages[0][0] : 'N/A';

    // Tráfico por hora
    const trafficOverTime = Array(24).fill(0);
    analytics.forEach(item => {
      const date = new Date(item.timestamp);
      if (!isNaN(date)) {
        const hour = date.getHours();
        trafficOverTime[hour]++;
      }
    });

    // Top 5 páginas
    const topPages = sortedPages.slice(0, 5);

    res.json({
      totalRequests,
      uniqueVisitors,
      avgRequestsPerHour,
      topPage,
      trafficOverTime: {
        labels: Array.from({ length: 24 }, (_, i) => `${i}:00`),
        data: trafficOverTime
      },
      topPages: {
        labels: topPages.map(([page]) => page),
        data: topPages.map(([, count]) => count)
      }
    });
  } catch (err) {
    console.error('Error fetching analytics data:', err);
    res.status(500).json({ error: 'Failed to retrieve analytics data' });
  }
});

module.exports = router;
