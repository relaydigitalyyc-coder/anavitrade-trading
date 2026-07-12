const mysql = require('mysql2/promise');

mysql.createConnection(process.env.DATABASE_URL).then(async conn => {
  // Score distribution for ALL July Tier A+B Buy signals
  const [dist] = await conn.execute(`
    SELECT 
      FLOOR(qualityScore) as score_floor,
      COUNT(*) as count,
      AVG(maxProfit) as avg_profit,
      MIN(maxProfit) as min_profit,
      MAX(maxProfit) as max_profit
    FROM coinlegs_signals
    WHERE signal = 1 AND qualityTier IN ('A','B')
      AND signalDate >= '2026-07-01' AND signalDate < '2026-08-01'
    GROUP BY FLOOR(qualityScore)
    ORDER BY score_floor ASC
  `);
  console.log('Score distribution:');
  dist.forEach(d => {
    console.log(`  Score ${d.score_floor}: ${d.count} signals, avg profit ${parseFloat(d.avg_profit||0).toFixed(2)}%, range [${parseFloat(d.min_profit||0).toFixed(2)}%, ${parseFloat(d.max_profit||0).toFixed(2)}%]`);
  });

  // Also check ALL Tier C signals in July (signals we would NOT take - these are the losses)
  const [tierC] = await conn.execute(`
    SELECT marketName, indicatorShortName, period, qualityTier, qualityScore, maxProfit, signalDate
    FROM coinlegs_signals
    WHERE signal = 1 AND qualityTier = 'C'
      AND signalDate >= '2026-07-01' AND signalDate < '2026-08-01'
    ORDER BY qualityScore DESC
    LIMIT 20
  `);
  console.log('\nTop Tier C signals (ones we FILTERED OUT):');
  tierC.forEach(s => {
    const mp = s.maxProfit !== null ? parseFloat(s.maxProfit).toFixed(2) : 'null';
    console.log(String(s.signalDate).slice(0,10), s.marketName, s.period, 'Score:' + s.qualityScore, 'MaxProfit:' + mp + '%');
  });

  // Check signals with low quality score that we DID take (Tier A/B but score < 5)
  const [lowScore] = await conn.execute(`
    SELECT marketName, indicatorShortName, period, qualityTier, qualityScore, maxProfit, signalDate
    FROM coinlegs_signals
    WHERE signal = 1 AND qualityTier IN ('A','B')
      AND qualityScore < 5
      AND signalDate >= '2026-07-01' AND signalDate < '2026-08-01'
    ORDER BY qualityScore ASC
    LIMIT 20
  `);
  console.log('\nLow-score Tier A/B signals (borderline trades we took):');
  lowScore.forEach(s => {
    const mp = s.maxProfit !== null ? parseFloat(s.maxProfit).toFixed(2) : 'null';
    console.log(String(s.signalDate).slice(0,10), s.marketName, s.period, 'Tier:' + s.qualityTier, 'Score:' + s.qualityScore, 'MaxProfit:' + mp + '%');
  });

  // Check how many signals have maxProfit < 2% (near-zero wins, essentially flat)
  const [flat] = await conn.execute(`
    SELECT COUNT(*) as count FROM coinlegs_signals
    WHERE signal = 1 AND qualityTier IN ('A','B')
      AND maxProfit IS NOT NULL AND maxProfit < 2
      AND signalDate >= '2026-07-01' AND signalDate < '2026-08-01'
  `);
  console.log('\nSignals with maxProfit < 2% (near-flat):', flat[0].count);

  await conn.end();
}).catch(console.error);
