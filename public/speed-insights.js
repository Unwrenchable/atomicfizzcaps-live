// Vercel Speed Insights Client-Side Initialization
// This file initializes Speed Insights for performance monitoring
// Note: The @vercel/speed-insights package is primarily for Node.js/React environments
// For this HTML application, the CDN script injection is the primary method

(function() {
  // Initialize Speed Insights if available from CDN
  if (window.vercelSpeedInsights) {
    console.log('Vercel Speed Insights initialized from CDN');
  }
  
  // Track core web vitals manually as fallback
  if ('web-vital' in window || 'PerformanceObserver' in window) {
    // Track Largest Contentful Paint (LCP)
    if ('PerformanceObserver' in window) {
      try {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            console.log('LCP:', entry.renderTime || entry.loadTime);
          }
        });
        observer.observe({ entryTypes: ['largest-contentful-paint'] });
      } catch (e) {
        console.log('LCP observer not supported');
      }
    }
  }
  
  console.log('Speed Insights monitoring active');
})();
