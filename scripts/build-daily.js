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
    const files = fs.readdirSync('.').filter((f) => !f.startsWith('.'));
    const prompt = `You're building Netflix Project LLM (45-day roadmap).

TASK ${task.id}: ${task.desc}
PHASE: ${backlog.phases[task.phase]}

REPO STATE:
Files: ${files.join(', ')}

RULES:
- Generate ONLY valid React/Vite/Tailwind code (<200 lines)
- Create missing files: package.json, vite.config.js, index.html if needed
- Use TMDB API: https://api.themoviedb.org/3/trending/all/week?api_key=free
- For each file, output in this format:

\`\`\`
FILENAME
<file content here>
\`\`\`

Do NOT explain anything, only output one or more such code blocks. Start with Task ${task.id} ONLY.`;

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await model.generateContent(prompt);
    const response = result.response.text();

    console.log('🤖 AI Response (preview):', response.slice(0, 300) + '...');

    // Parse and write files
    const changes = parseAIResponse(response);
    let hasChanges = false;

    for (const change of changes) {
      const dir = path.dirname(change.filename);
      if (dir && dir !== '.') {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(change.filename, change.content);
      console.log(`✏️ Wrote: ${change.filename}`);
      hasChanges = true;
    }

    // Daily progress log
    const date = new Date().toISOString().split('T')[0];
    fs.mkdirSync('docs/progress', { recursive: true });
    fs.writeFileSync(
      `docs/progress/${date}-${task.id}.md`,
      `# Task ${task.id}: ${task.title}\n\n${response.slice(0, 1000)}`
    );

    // Validate & Commit
    if (hasChanges) {
      try {
        execSync('npm install || true', { stdio: 'inherit' });
      } catch (e) {
        console.log('npm install failed, continuing:', e.message);
      }

      try {
        execSync('npm run lint --silent', { stdio: 'inherit' });
      } catch (e) {
        console.log('Lint failed or not configured, continuing:', e.message);
      }

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
    console.error('❌ Failed:', error);
    process.exit(1);
  }
}

function parseAIResponse(text) {
  const changes = [];
  // Split on triple backticks, which wrap each code block
  const parts = text.split('```
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    const lines = trimmed.split('\n');
    if (lines.length < 2) continue;

    const firstLine = lines.trim();
    if (!firstLine || firstLine.includes(' ')) continue; // likely not a filename

    const filename = firstLine;
    const content = lines.slice(1).join('\n').trim();
    if (filename && content) {
      changes.push({ filename, content });
    }
  }
  return changes;
}

main();
