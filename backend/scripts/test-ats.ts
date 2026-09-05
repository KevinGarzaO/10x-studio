// Direct test — no imports from the pipeline, just raw fetch calls

const log = (msg: string) => console.log(msg);

async function testWorkable() {
  console.log("\n=== TESTING WORKABLE (platzi) ===");
  try {
    const res = await fetch("https://apply.workable.com/api/v1/widget/accounts/platzi?details=true");
    if (!res.ok) { console.log(`  HTTP ${res.status}`); return 0; }
    const data: any = await res.json();
    const jobs = data.jobs ?? [];
    console.log(`  ✅ ${jobs.length} vacantes encontradas`);
    if (jobs.length > 0) {
      console.log(`  Primera: ${jobs[0].title}`);
      console.log(`  Apply URL: https://apply.workable.com/platzi/j/${jobs[0].shortcode}/`);
    }
    return jobs.length;
  } catch (e: any) {
    console.log(`  ❌ Error: ${e.message}`);
    return 0;
  }
}

async function testGreenhouse() {
  console.log("\n=== TESTING GREENHOUSE (github) ===");
  try {
    const res = await fetch("https://boards-api.greenhouse.io/v1/boards/github/jobs?content=true");
    if (!res.ok) { console.log(`  HTTP ${res.status}`); return 0; }
    const data: any = await res.json();
    const jobs = data.jobs ?? [];
    console.log(`  ✅ ${jobs.length} vacantes encontradas`);
    if (jobs.length > 0) {
      console.log(`  Primera: ${jobs[0].title}`);
      console.log(`  Apply URL: ${jobs[0].absolute_url}`);
    }
    return jobs.length;
  } catch (e: any) {
    console.log(`  ❌ Error: ${e.message}`);
    return 0;
  }
}

async function testLever() {
  console.log("\n=== TESTING LEVER (netlify) ===");
  try {
    const res = await fetch("https://api.lever.co/v0/postings/netlify?mode=json");
    if (!res.ok) { console.log(`  HTTP ${res.status}`); return 0; }
    const data: any = await res.json();
    const jobs = Array.isArray(data) ? data : [];
    console.log(`  ✅ ${jobs.length} vacantes encontradas`);
    if (jobs.length > 0) {
      console.log(`  Primera: ${jobs[0].text}`);
      console.log(`  Apply URL: ${jobs[0].hostedUrl}`);
    }
    return jobs.length;
  } catch (e: any) {
    console.log(`  ❌ Error: ${e.message}`);
    return 0;
  }
}

async function main() {
  console.log("Probando conectores ATS...\n");

  const workable = await testWorkable();
  const greenhouse = await testGreenhouse();
  const lever = await testLever();

  console.log("\n=== RESUMEN ===");
  console.log(`Workable:   ${workable} vacantes`);
  console.log(`Greenhouse: ${greenhouse} vacantes`);
  console.log(`Lever:      ${lever} vacantes`);

  if (workable > 0 && greenhouse > 0 && lever > 0) {
    console.log("\n✅ Todos los conectores funcionan!");
  } else {
    console.log("\n⚠️ Algunos conectores no devolvieron datos");
  }
}

main();
