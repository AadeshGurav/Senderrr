const fs = require('fs');
const glob = require('glob');

const files = glob.sync('/Users/aadeshgurav/projekts/OpenWA_1/OpenWA/database/entities/**/*.ts');

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  let updated = false;

  // Replace @Column({ nullable: true }) if the next line has Date | null
  // Regex to match @Column({ nullable: true }) followed by propertyName: Date | null;
  const regex = /@Column\(\{\s*nullable:\s*true\s*\}\)\s*\n\s*(\w+):\s*Date\s*\|\s*null;/g;
  
  if (regex.test(content)) {
    content = content.replace(regex, (match, propName) => {
      return `@Column({ type: Date, nullable: true })\n  ${propName}: Date | null;`;
    });
    fs.writeFileSync(file, content);
    console.log(`Updated ${file}`);
  }
}
