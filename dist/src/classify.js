const TOOL_PATTERNS = [
    /github\.com\/[\w-]+\/[\w-]+/i,
    /\bnpm\s+(install|i)\b/i,
    /\bpip\s+install\b/i,
    /\bcargo\s+add\b/i,
    /\bbrew\s+install\b/i,
    /\bopen[\s-]?source\b/i,
    /\bcli\b.*\btool\b/i,
    /\btool\b.*\bcli\b/i,
    /\bnpx\s+/i,
    /\brepo\b.*\bgithub\b/i,
    /\bgithub\b.*\brepo\b/i,
    /\bself[\s-]?hosted\b/i,
    /\bopen[\s-]?sourced?\b/i,
    /\bvscode\s+extension\b/i,
    /\bapi\b.*\b(library|sdk|wrapper)\b/i,
    /\bframework\b/i,
];
const SECURITY_PATTERNS = [
    /\bcve[-\s]?\d{4}/i,
    /\bvulnerabilit/i,
    /\bexploit/i,
    /\bmalware\b/i,
    /\bransomware\b/i,
    /\bsupply[\s-]?chain\s+attack/i,
    /\bsecurity\s+(flaw|bug|issue|patch|advisory|update|breach)/i,
    /\bbreach\b/i,
    /\bbackdoor\b/i,
    /\bzero[\s-]?day\b/i,
    /\bremote\s+code\s+execution\b/i,
    /\brce\b/i,
    /\bprivilege\s+escalation\b/i,
    /\bcompromised?\b/i,
];
const TECHNIQUE_PATTERNS = [
    /\bhow\s+(I|we|to)\b/i,
    /\btutorial\b/i,
    /\bwalkthrough\b/i,
    /\bstep[\s-]?by[\s-]?step\b/i,
    /\bbuilt\s+(with|using|this|a|an|my)\b/i,
    /\bhere'?s?\s+how\b/i,
    /\bcode\s+(pattern|example|snippet|sample)\b/i,
    /\barchitecture\b.*\b(of|for|behind)\b/i,
    /\bimplemented?\b.*\bfrom\s+scratch\b/i,
    /\bunder\s+the\s+hood\b/i,
    /\bdeep[\s-]?dive\b/i,
    /\btechnique\b/i,
    /\bpattern\b.*\b(for|in|to)\b/i,
    /\bbest\s+practices?\b/i,
    /\bplaybook\b/i,
];
const LAUNCH_PATTERNS = [
    /\bjust\s+(launched|shipped|released|dropped|published)\b/i,
    /\bwe('re|\s+are)\s+(launching|shipping|releasing)\b/i,
    /\bannouncing\b/i,
    /\bintroduc(ing|es?)\b/i,
    /\bnow\s+(available|live|in\s+beta)\b/i,
    /\bv\d+\.\d+/i,
    /\b(alpha|beta)\s+(release|launch|is\s+here)\b/i,
    /\bproduct\s+hunt\b/i,
    /\bcheck\s+it\s+out\b/i,
    /\bnew\s+feature\b/i,
];
const RESEARCH_PATTERNS = [
    /arxiv\.org/i,
    /\bpaper\b.*\b(new|our|this|the)\b/i,
    /\b(new|our|this)\b.*\bpaper\b/i,
    /\bstudy\b.*\b(finds?|shows?|reveals?)\b/i,
    /\bfindings?\b/i,
    /\bpeer[\s-]?review/i,
    /\bpreprint\b/i,
    /\bresearch\b.*\b(from|by|at|shows?)\b/i,
    /\bpublished\s+in\b/i,
    /\bjournal\b/i,
    /\bstate[\s-]?of[\s-]?the[\s-]?art\b/i,
    /\bwhite\s*paper\b/i,
];
const OPINION_PATTERNS = [
    /\bunpopular\s+opinion\b/i,
    /\bhot\s+take\b/i,
    /\bhere'?s?\s+(why|what|my\s+take)\b/i,
    /\bi\s+think\b.*\b(about|that)\b/i,
    /\bcontroversial\b/i,
    /\boverrated\b/i,
    /\bunderrated\b/i,
    /\blessons?\s+(learned|from)\b/i,
    /\bmistakes?\s+(I|we)\b/i,
    /\bmy\s+(take|thoughts?|perspective)\b/i,
    /\bhere'?s?\s+what\s+I\b/i,
];
const COMMERCE_PATTERNS = [
    /\bamazon\.com\b/i,
    /\bshop\s+(here|now)\b/i,
    /\bbuy\s+(now|here|this)\b/i,
    /\bdiscount\b/i,
    /\bcoupon\b/i,
    /\baffiliate\b/i,
    /\$\d+(\.\d{2})?\s*(off|USD|discount)/i,
];
const TOOL_DOMAINS = new Set([
    "github.com", "gitlab.com", "huggingface.co", "npmjs.com",
    "pypi.org", "crates.io", "pkg.go.dev",
]);
const RESEARCH_DOMAINS = new Set([
    "arxiv.org", "scholar.google.com", "semanticscholar.org",
    "biorxiv.org", "medrxiv.org", "nature.com", "science.org",
]);
const COMMERCE_DOMAINS = new Set([
    "amazon.com", "www.amazon.com", "ebay.com", "store.steampowered.com",
]);
const CATEGORY_PATTERNS = [
    { category: "security", patterns: SECURITY_PATTERNS },
    { category: "tool", patterns: TOOL_PATTERNS },
    { category: "technique", patterns: TECHNIQUE_PATTERNS },
    { category: "launch", patterns: LAUNCH_PATTERNS },
    { category: "research", patterns: RESEARCH_PATTERNS },
    { category: "opinion", patterns: OPINION_PATTERNS },
    { category: "commerce", patterns: COMMERCE_PATTERNS },
];
function extractHostnames(links) {
    const hosts = new Set();
    for (const link of links) {
        try {
            hosts.add(new URL(link).hostname.replace(/^www\./, ""));
        }
        catch { /* skip invalid */ }
    }
    return hosts;
}
export function classifyBookmark(record) {
    const text = record.text;
    const hosts = extractHostnames(record.links);
    const scores = new Map();
    for (const { category, patterns } of CATEGORY_PATTERNS) {
        let score = 0;
        for (const pattern of patterns) {
            if (pattern.test(text)) {
                score += 1;
            }
        }
        if (score > 0) {
            scores.set(category, score);
        }
    }
    // Domain-based boosts
    for (const host of hosts) {
        if (TOOL_DOMAINS.has(host))
            scores.set("tool", (scores.get("tool") ?? 0) + 2);
        if (RESEARCH_DOMAINS.has(host))
            scores.set("research", (scores.get("research") ?? 0) + 2);
        if (COMMERCE_DOMAINS.has(host))
            scores.set("commerce", (scores.get("commerce") ?? 0) + 2);
    }
    const matched = [...scores.entries()]
        .filter(([, s]) => s > 0)
        .sort((a, b) => b[1] - a[1]);
    if (matched.length === 0) {
        return { categories: ["unclassified"], primary: "unclassified" };
    }
    return {
        categories: matched.map(([c]) => c),
        primary: matched[0][0],
    };
}
export function classifyCorpus(records) {
    const results = new Map();
    for (const record of records) {
        results.set(record.id, classifyBookmark(record));
    }
    return results;
}
