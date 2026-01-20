const fs = require('fs');
const path = require('path');

const SOURCE_DIR = path.join(__dirname, '..');
const OUTPUT_DIR = path.join(__dirname, '../years');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Get all MD files
const files = fs.readdirSync(SOURCE_DIR).filter(f => f.endsWith('.md') && f !== 'index.md');

const questionsByYear = {};

files.forEach(file => {
    const subject = file.replace('.md', '').replace(/_/g, ' ');
    const content = fs.readFileSync(path.join(SOURCE_DIR, file), 'utf-8');
    
    // Split by Year header
    // Regex matches "## Year: 2024" or similar
    const yearBlocks = content.split(/^## Year:\s*(\d+)/m);
    
    // yearBlocks[0] is preamble before first year
    // yearBlocks[1] is first year string
    // yearBlocks[2] is content for first year
    // yearBlocks[3] is second year string...
    
    for (let i = 1; i < yearBlocks.length; i += 2) {
        const year = yearBlocks[i].trim();
        const yearContent = yearBlocks[i+1];
        
        if (!questionsByYear[year]) {
            questionsByYear[year] = {};
        }
        if (!questionsByYear[year][subject]) {
            questionsByYear[year][subject] = [];
        }
        
        // Split questions within the year
        // Questions start with "### Question"
        const questions = yearContent.split(/^### Question\s*\d+/m).slice(1); // slice 1 to remove empty start
        
        questions.forEach((q, idx) => {
            // clean up the question content
            // The split removes "### Question N", so we just have the body
            // We usually want to preserve the question numbering? Or re-number?
            // Let's re-number in the output.
            
            questionsByYear[year][subject].push(q.trim());
        });
    }
});

// Generate files for each year
Object.keys(questionsByYear).sort((a, b) => b - a).forEach(year => {
    let fileContent = "# UPSC Prelims " + year + " - Compiled Papers\n\n";
    
    const subjects = Object.keys(questionsByYear[year]).sort();
    
    subjects.forEach(subject => {
        fileContent += "## " + subject + "\n\n";
        questionsByYear[year][subject].forEach((q, idx) => {
            fileContent += "### Question " + (idx + 1) + "\n\n" + q + "\n\n";
        });
        fileContent += "---\n\n";
    });
    
    fs.writeFileSync(path.join(OUTPUT_DIR, year + ".md"), fileContent);
    console.log(`Generated ${year}.md`);
});

console.log('Done!');
