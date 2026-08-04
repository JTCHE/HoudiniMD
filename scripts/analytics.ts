const accountId = process.env.R2_ACCOUNT_ID;
const token = process.env.CF_ANALYTICS_TOKEN;

if (!accountId || !token) throw new Error("Set R2_ACCOUNT_ID and CF_ANALYTICS_TOKEN");

async function query(sql: string): Promise<Record<string, unknown>[]> {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/analytics_engine/sql`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: sql,
  });
  const body = await response.json() as { data?: Record<string, unknown>[]; errors?: { message: string }[] };
  if (!response.ok) throw new Error(body.errors?.map((error) => error.message).join(", ") || response.statusText);
  return body.data ?? [];
}

function print(title: string, rows: Record<string, unknown>[]) {
  console.log(`\n${title}`);
  console.table(rows);
}

const search = "blob1 = 'search' AND blob3 IN ('overlay', 'api')";
const [zeroResults, ranks] = await Promise.all([
  query(`SELECT blob2 AS query, SUM(_sample_interval) AS searches FROM houdinimd_views WHERE ${search} AND double1 = 0 GROUP BY query ORDER BY searches DESC LIMIT 30`),
  query("SELECT double1 AS rank, SUM(_sample_interval) AS clicks FROM houdinimd_views WHERE blob1 = 'click' GROUP BY rank ORDER BY rank"),
]);

print("Zero-result queries", zeroResults);
print("Clicked-rank histogram", ranks);
const total = ranks.reduce((sum, row) => sum + Number(row.clicks), 0);
const mean = total ? ranks.reduce((sum, row) => sum + Number(row.rank) * Number(row.clicks), 0) / total : 0;
console.log(`Mean clicked rank: ${mean.toFixed(2)}`);
