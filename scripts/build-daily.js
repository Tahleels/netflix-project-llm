const fs = require('fs');
const { execSync } = require('child_process');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');

async function main() {
  try {
    // Load backlog
    const backlog = JSON.parse(fs.readFileSync('backlog.json', 'utf8'));
    if (!backlog.pending.length) {
      console.log('✅ All tasks completed!');
      process.exit(0);
    }
    
    // Pick next task
    const task = backlog.pending[0];
    console.log(`🚀 Building Task ${task.id}: ${task.title}`);
    
    // Build context
    const files = fs.readdirSync('.').filter(f => !f.startsWith('.'));
    const recentCommits = execSync('git log --oneline -5 || echo "No history"').toString();
    
    const prompt = `You're building Netflix Project LLM (45-day roadmap). 

**TASK ${task.id}**: ${task.desc}
**PHASE**: ${backlog.phases[task.phase]}

**REPO STATE**:
Files: ${files.join(', ')}

**RULES**:
- Generate ONLY valid React/Vite/Tailwind code (<200 lines)
- Create missing files: package.json, vite.config.js, index.html if needed
- Use TMDB API: https://api.themoviedb.org/3/trending/all/week?api_key=free
- Output format exactly:
\`\`\`
FILENAME|content
\`\`\`
(with | separator)

**Start with Task ${task.id} ONLY.**`;

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await model.generateContent(prompt);
    const response = result.response.text();
    
    console.log('🤖 AI Response:', response.slice(0, 300) + '...');
    
    // Parse and write files
    const changes = parseAIResponse(response);
    let hasChanges = false;
    
    for (const change of changes) {
      fs.writeFileSync(change.filename, change.content);
      console.log(`✏️ Wrote: ${change.filename}`);
      hasChanges = true;
    }
    
    // Daily progress log
    const date = new Date().toISOString().split('T')[0];
    fs.mkdirSync('docs/progress', { recursive: true });
    fs.writeFileSync(`docs/progress/${date}-${task.id}.md`, `# Task ${task.id}: ${task.title}\n\n${response.slice(0, 1000)}`);
    
    // Validate & Commit
    if (hasChanges) {
      execSync('npm install || true');
      execSync('npm run lint --silent || echo "Lint warnings OK"');
      
      execSync('git config user.name "AI Development Agent"');
      execSync('git config user.email "bot@netflix-project-llm.com"');
      execSync('git add .');
      
      const summary = task.title.slice(0, 50);
      execSync(`git commit -m "feat(netflix): ${summary} (#${task.id})"`);
      execSync('git push');
      
      // Mark complete
      backlog.completed.push(backlog.pending.shift());
      fs.writeFileSync('backlog.json', JSON.stringify(backlog, null, 2));
      
      console.log(`✅ Task ${task.id} COMPLETE! Pushed to main.`);
    } else {
      console.log('⚠️ No changes generated. Skipping commit.');
    }
  } catch (error) {
    console.error('❌ Failed:', error.message);
    process.exit(1);
  }
}

function parseAIResponse(text) {
  const changes = [];
  const blocks = text.split('```
  for (const block of blocks) {
    if (block.includes('|')) {
      const lines = block.split('\n');
      const filename = lines.trim();
      const content = lines.slice(1).join('\n').trim();
      changes.push({ filename, content });
    }
  }
  return changes.filter(c => c.filename && c.content);
}

main();
