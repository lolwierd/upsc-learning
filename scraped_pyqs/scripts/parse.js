const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const files = [
    { name: 'Ancient_Medieval_History', path: 'ancient.html' },
    { name: 'Environment_Ecology', path: 'environment.html' },
    { name: 'Modern_History', path: 'modern.html' },
    { name: 'Geography', path: 'geography.html' },
    { name: 'Art_Culture', path: 'art_culture.html' },
    { name: 'Indian_Economy', path: 'economy.html' },
    { name: 'Indian_Polity', path: 'polity.html' },
    { name: 'Science_Technology', path: 'science.html' }
];

console.log("Starting processing...");

files.forEach(file => {
    const filePath = path.join(__dirname, file.path);
    if (!fs.existsSync(filePath)) {
        console.log(`Skipping ${file.name}: file not found at ${filePath}`);
        return;
    }

    console.log(`Processing ${file.name}...`);
    const html = fs.readFileSync(filePath, 'utf8');
    const $ = cheerio.load(html);
    
    // Try to find the content container
    let content = $('.pf-content');
    if (content.length === 0) content = $('.entry-content');
    if (content.length === 0) content = $('.dpt_content');

    if (content.length === 0) {
        console.log(`Could not find content for ${file.name}`);
        return;
    }

    let output = `# ${file.name.replace(/_/g, ' ')}

`;
    
    // We iterate over children of the content div
    content.children().each((i, el) => {
        const $el = $(el);
        const text = $el.text().trim();
        
        // Check for Year Header
        if (/^\d{4}$/.test(text) && parseInt(text) > 2000 && parseInt(text) < 2030) {
            output += `
## Year: ${text}

`;
            return;
        }

        // Check for Question Header "Question X"
        if (/^Question\s+\d+/.test(text)) {
            output += `### ${text}

`;
            return;
        }

        // Check for Answer "Ans: X"
        if (/^Ans:/i.test(text)) {
            output += `
**${text}**

---

`;
            return;
        }

        // Check for Images
        const imgs = $el.find('img');
        if (imgs.length > 0) {
            imgs.each((j, img) => {
                const src = $(img).attr('src');
                const alt = $(img).attr('alt') || '';
                if (src && !src.includes('pixel')) {
                   output += `![${alt}](${src})

`;
                }
            });
        }

        // Check for Options
        if (/^\([a-d]\)/i.test(text)) {
            output += `- ${text}
`;
            return;
        }

        // Check for Explanation
        if (/^Explanation:/i.test(text)) {
            output += `> ${text}

`;
            return;
        }

        // Regular paragraph text
        if (text.length > 0 && !/^Question\s+\d+/.test(text) && !/^\d{4}$/.test(text)) {
             output += `${text}

`;
        }
    });

    fs.writeFileSync(path.join(__dirname, `${file.name}.md`), output);
    console.log(`Saved ${file.name}.md`);
});

console.log("Done.");
