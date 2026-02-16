// Pre-publish validation script — reads post JSON from stdin
const fs = require('fs');
try {
    const raw = fs.readFileSync('/dev/stdin', 'utf8');
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) { console.log('FAIL: No JSON found in output'); process.exit(1); }
    const post = JSON.parse(match[0]);
    const required = ['id','title','slug','category','excerpt','body','author','date','published','thumbnail_gradient'];
    const missing = required.filter(f => !post[f] && post[f] !== true);
    if (missing.length) { console.log('FAIL: Missing fields: ' + missing.join(', ')); process.exit(1); }
    if (post.id !== post.slug) { console.log('FAIL: id and slug do not match'); process.exit(1); }
    const cats = ['News','Strategy','Spoilers','Deck Guides','Set Reviews'];
    if (!cats.includes(post.category)) { console.log('FAIL: Invalid category: ' + post.category); process.exit(1); }
    if (!post.body.includes('<h2>')) { console.log('FAIL: Body missing h2 sections'); process.exit(1); }
    console.log('PASS: Post validated (' + post.title + ')');
} catch(e) {
    console.log('FAIL: ' + e.message);
    process.exit(1);
}
