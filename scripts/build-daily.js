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
Recent: ${recentCommits}

**RULES**:
- Generate ONLY valid React/Vite/Tailwind code (<200 lines)
- Create missing files: package.json, vite.config.js, index.html if needed
- Use TMDB API: https://api.themoviedb.org/3/trending/all/week?api_key=free
- Output format exactly:
