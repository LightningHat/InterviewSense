import { clampField, stripPIIAndInjections } from './anonymizer.js';
const SKILL_TAXONOMY = [
    // Embedded
    { id: 'c', name: 'C', domain: 'embedded', aliases: ['c language', 'embedded c'] },
    { id: 'c++', name: 'C++', domain: 'embedded', aliases: ['cpp'] },
    { id: 'rtos', name: 'RTOS', domain: 'embedded', aliases: ['freertos', 'zephyr', 'vxworks', 'real-time os'] },
    { id: 'i2c', name: 'I2C', domain: 'embedded', aliases: ['iic', 'twi', 'two wire'] },
    { id: 'spi', name: 'SPI', domain: 'embedded', aliases: ['serial peripheral interface'] },
    { id: 'uart', name: 'UART', domain: 'embedded', aliases: ['usart', 'serial'] },
    { id: 'dma', name: 'DMA', domain: 'embedded', aliases: ['direct memory access'] },
    { id: 'timers', name: 'Timers', domain: 'embedded', aliases: ['hardware timers', 'pwm'] },
    { id: 'interrupts', name: 'Interrupts', domain: 'embedded', aliases: ['isr', 'nvic'] },
    { id: 'gpio', name: 'GPIO', domain: 'embedded', aliases: ['general purpose input output'] },
    { id: 'adc', name: 'ADC', domain: 'embedded', aliases: ['analog to digital'] },
    { id: 'can-bus', name: 'CAN Bus', domain: 'embedded', aliases: ['can protocol', 'canopen'] },
    { id: 'arm-cortex', name: 'ARM Cortex', domain: 'embedded', aliases: ['cortex-m', 'stm32', 'nordic'] },
    // Web
    { id: 'javascript', name: 'JavaScript', domain: 'web', aliases: ['js', 'es6', 'ecmascript'] },
    { id: 'typescript', name: 'TypeScript', domain: 'web', aliases: ['ts'] },
    { id: 'react', name: 'React', domain: 'web', aliases: ['reactjs', 'react.js'] },
    { id: 'nextjs', name: 'Next.js', domain: 'web', aliases: ['next', 'next.js'] },
    { id: 'html', name: 'HTML', domain: 'web', aliases: ['html5'] },
    { id: 'css', name: 'CSS', domain: 'web', aliases: ['css3', 'sass', 'tailwind'] },
    { id: 'web-workers', name: 'Web Workers', domain: 'web', aliases: ['workers', 'audioworklet'] },
    { id: 'indexeddb', name: 'IndexedDB', domain: 'web', aliases: ['idb'] },
    { id: 'webgpu', name: 'WebGPU', domain: 'web', aliases: ['webgl'] },
    // Backend
    { id: 'python', name: 'Python', domain: 'backend', aliases: ['fastapi', 'django', 'flask'] },
    { id: 'node', name: 'Node.js', domain: 'backend', aliases: ['nodejs', 'express'] },
    { id: 'sql', name: 'SQL', domain: 'backend', aliases: ['postgresql', 'mysql', 'sqlite'] },
    { id: 'docker', name: 'Docker', domain: 'backend', aliases: ['containers', 'dockerfile'] },
    { id: 'redis', name: 'Redis', domain: 'backend', aliases: ['cache', 'redis cache'] },
    { id: 'rest', name: 'REST APIs', domain: 'backend', aliases: ['restful', 'api design'] },
    { id: 'kafka', name: 'Kafka', domain: 'backend', aliases: ['message queue', 'pubsub'] },
    { id: 'grpc', name: 'gRPC', domain: 'backend', aliases: ['protobuf', 'protocol buffers'] },
];
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
export function extractProfileFromText(rawText) {
    const sanitized = stripPIIAndInjections(rawText);
    const lower = sanitized.toLowerCase();
    // 1. Match skills
    const matchedSkills = [];
    const domainCounts = {};
    for (const skill of SKILL_TAXONOMY) {
        let matched = false;
        // Check main id/name with escaped regex
        const escapedId = escapeRegex(skill.id);
        const mainRegex = new RegExp(`(^|[^a-z0-9])${escapedId}([^a-z0-9]|$)`, 'i');
        if (mainRegex.test(lower) || lower.includes(skill.name.toLowerCase())) {
            matched = true;
        }
        else {
            // Check aliases
            for (const alias of skill.aliases) {
                if (lower.includes(alias.toLowerCase())) {
                    matched = true;
                    break;
                }
            }
        }
        if (matched) {
            matchedSkills.push(skill.id);
            domainCounts[skill.domain] = (domainCounts[skill.domain] || 0) + 1;
        }
    }
    // Cap skills at 15
    const skills = matchedSkills.slice(0, 15);
    // 2. Identify top domains (max 5)
    const domains = Object.entries(domainCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([domain]) => domain)
        .slice(0, 5);
    if (domains.length === 0) {
        domains.push('embedded'); // Default domain if none found
    }
    // 3. Determine level
    let level = 'intern';
    if (/lead\b|principal\b|architect\b|staff engineer|senior/i.test(sanitized)) {
        level = 'senior';
    }
    else if (/(\d+)\+?\s*years(?:\s+of)?\s+experience/i.test(sanitized)) {
        const match = sanitized.match(/(\d+)\+?\s*years(?:\s+of)?\s+experience/i);
        const yrs = match ? parseInt(match[1], 10) : 0;
        if (yrs >= 5)
            level = 'senior';
        else if (yrs >= 3)
            level = 'mid';
        else if (yrs >= 1)
            level = 'junior';
        else
            level = 'intern';
    }
    else if (/junior|associate|graduate/i.test(sanitized)) {
        level = 'junior';
    }
    else if (/intern|student|bachelor|master|university|candidate/i.test(sanitized)) {
        level = 'intern';
    }
    else {
        level = 'junior';
    }
    // 4. Extract projects (up to 4)
    const projects = [];
    const projectSectionRegex = /(?:projects?|academic projects?|experience)[\s\S]*?(?=\n\s*(?:education|skills|certifications|awards|$))/i;
    const projectSectionMatch = sanitized.match(projectSectionRegex);
    const searchBlock = projectSectionMatch ? projectSectionMatch[0] : sanitized;
    // Split candidate lines looking for project bullets or headings
    const lines = searchBlock
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 15 && !/^(skills|education|contact|summary)/i.test(l));
    for (let i = 0; i < Math.min(lines.length, 12); i += 2) {
        if (projects.length >= 4)
            break;
        const titleLine = lines[i];
        const summaryLine = lines[i + 1] || titleLine;
        // Discover tech keywords used in the project lines
        const projectTech = skills.filter((s) => titleLine.toLowerCase().includes(s) ||
            summaryLine.toLowerCase().includes(s));
        projects.push({
            title: clampField(titleLine.replace(/^[-•*#\d.]+\s*/, ''), 80),
            summary: clampField(summaryLine.replace(/^[-•*#\d.]+\s*/, ''), 180),
            tech: projectTech.slice(0, 5),
        });
    }
    // If no structured projects could be delineated, provide standard synthesized items from skills
    if (projects.length === 0) {
        projects.push({
            title: clampField(`${domains[0].toUpperCase()} Development Experience`, 80),
            summary: clampField(`Practical experience developing and testing applications using ${skills.slice(0, 3).join(', ')}.`, 180),
            tech: skills.slice(0, 4),
        });
    }
    return {
        level,
        skills,
        domains,
        projects: projects.slice(0, 4),
    };
}
