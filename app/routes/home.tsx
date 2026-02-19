import React from 'react';
import type { Route } from "./+types/home";
import {
  Terminal,
  Code,
  ExternalLink,
  Github,
  Linkedin,
  Cpu,
  Server,
  Globe,
  Box,
  Layers,
  FileText,
  Mail,
  Moon,
  Sun
} from 'lucide-react';
import { useTheme } from '../components/ThemeContext';

export function meta({ }: Route.MetaArgs) {
  return [
    { title: "Bryant Hargreaves - Portfolio" },
    { name: "description", content: "Full Stack Developer & Researcher" },
  ];
}

// --- UI Components ---

const SectionHeader = ({ title, icon: Icon }: { title: string, icon?: React.ComponentType<any> }) => (
  <div className="flex items-center gap-3 mb-8 border-b border-neutral-200 dark:border-neutral-800 pb-2 transition-colors">
    {Icon && <Icon className="w-5 h-5 text-amber-600 dark:text-[#d2b48c] transition-colors" />}
    <h2 className="text-2xl font-mono font-bold text-neutral-800 dark:text-neutral-100 uppercase tracking-widest pointer-events-auto w-max transition-colors">
      {title}
    </h2>
  </div>
);

const ProjectCard = ({ title, description, tags, links, featured = false }: { title: string, description: string, tags: string[], links: { url: string, label: string, icon?: React.ReactNode }[], featured?: boolean }) => (
  <div className={`
    group relative overflow-hidden transition-all duration-300
    border bg-white/50 dark:bg-neutral-900/50 backdrop-blur-sm pointer-events-auto
    ${featured
      ? 'border-amber-600/50 dark:border-[#d2b48c]/50 shadow-[0_0_15px_-3px_rgba(217,119,6,0.1)] dark:shadow-[0_0_15px_-3px_rgba(210,180,140,0.1)]'
      : 'border-neutral-200 dark:border-neutral-800 hover:border-neutral-400 dark:hover:border-neutral-600'}
  `}>
    <div className="p-6">
      <div className="flex justify-between items-start mb-4">
        <h3 className={`font-mono text-xl font-bold transition-colors ${featured ? 'text-amber-700 dark:text-[#d2b48c]' : 'text-neutral-800 dark:text-neutral-200'}`}>
          {title}
        </h3>
        <div className="flex gap-3">
          {links.map((link, i) => (
            <a
              key={i}
              href={link.url}
              target="_blank"
              rel="noreferrer"
              className="text-neutral-500 dark:text-neutral-400 hover:text-amber-600 dark:hover:text-[#d2b48c] transition-colors"
              title={link.label}
            >
              {link.icon || <ExternalLink size={18} />}
            </a>
          ))}
        </div>
      </div>

      <p className="text-neutral-600 dark:text-neutral-400 font-mono text-sm leading-relaxed mb-6 transition-colors">
        {description}
      </p>

      <div className="flex flex-wrap gap-2 mt-auto">
        {tags.map((tag, i) => (
          <span
            key={i}
            className="px-2 py-1 text-xs font-mono border border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-500 rounded bg-white/50 dark:bg-black/50 transition-colors"
          >
            {tag}
          </span>
        ))}
      </div>
    </div>

    {/* Decorative corner accents for featured items */}
    {featured && (
      <>
        <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-amber-600 dark:border-[#d2b48c] transition-colors" />
        <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-amber-600 dark:border-[#d2b48c] transition-colors" />
        <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-amber-600 dark:border-[#d2b48c] transition-colors" />
        <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-amber-600 dark:border-[#d2b48c] transition-colors" />
      </>
    )}
  </div>
);

const TimelineItem = ({ date, title, subtitle, details }: { date: string, title: string, subtitle: string, details: string[] }) => (
  <div className="relative pl-8 pb-10 border-l border-neutral-200 dark:border-neutral-800 last:pb-0 last:border-l-0 transition-colors">
    <div className="absolute left-[-5px] top-0 w-2.5 h-2.5 bg-amber-600 dark:bg-[#d2b48c] rounded-full shadow-[0_0_10px_rgba(217,119,6,0.5)] dark:shadow-[0_0_10px_#d2b48c] transition-colors" />
    <div className="flex flex-col sm:items-baseline gap-2 mb-1">
      <span className="font-mono text-xs text-amber-700 dark:text-[#d2b48c] min-w-[100px] pointer-events-auto w-max transition-colors">{date}</span>
      <h3 className="text-lg font-bold text-neutral-800 dark:text-neutral-200 font-mono pointer-events-auto w-max transition-colors">{title}</h3>
    </div>
    <div className="text-sm text-neutral-600 dark:text-neutral-500 font-mono mb-2 pointer-events-auto w-max transition-colors">{subtitle}</div>
    <ul className="list-none space-y-1">
      {details.map((detail, i) => (
        <li key={i} className="text-sm text-neutral-600 dark:text-neutral-400 font-mono pl-4 relative before:content-['>'] before:absolute before:left-0 before:text-neutral-400 dark:before:text-neutral-700 w-full pointer-events-auto transition-colors">
          {detail}
        </li>
      ))}
    </ul>
  </div>
);

const SkillBadge = ({ skill }: { skill: string }) => (
  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded text-sm text-neutral-700 dark:text-neutral-300 font-mono hover:border-amber-600/50 dark:hover:border-[#d2b48c]/50 hover:text-amber-700 dark:hover:text-[#d2b48c] transition-colors cursor-default pointer-events-auto shadow-sm dark:shadow-none">
    <div className="w-1 h-1 bg-current rounded-full" />
    {skill}
  </span>
);

export default function Home() {
  const { theme, setTheme } = useTheme();

  // Resume Data
  const projects = [
    {
      title: "Plutonium",
      description: "A cutting-edge platform emphasized in portfolio. High-performance computing architecture or service integration.",
      tags: ["React", "System Architecture", "Web"],
      featured: true,
      links: [
        { url: "https://plutonium.hargreaves.dev", label: "Live Site", icon: <Globe size={18} /> }
      ]
    },
    {
      title: "Pluto-RTC",
      description: "Real-time communication library and infrastructure. Engineered for low-latency data transmission.",
      tags: ["WebRTC", "NPM Package", "Networking"],
      featured: true,
      links: [
        { url: "https://plutonium.hargreaves.dev/docs", label: "Documentation", icon: <FileText size={18} /> },
        { url: "https://www.npmjs.com/package/pluto-rtc", label: "NPM Registry", icon: <Box size={18} /> }
      ]
    },
    {
      title: "flowpy",
      description: "SaaS visual scripting tool for students. Drag-and-drop infinite canvas powered by interactive Jupyter notebook server. Uses Google Cloud Run for on-demand GPU/CPU spinning.",
      tags: ["Next.js", "Python", "Google Cloud Run", "Firebase", "Jupyter"],
      featured: false,
      links: []
    },
    {
      title: "Angel's Protection (HackTX Winner)",
      description: "Real-time security system with lightweight computer vision models queried semantically using InterSystems' IRIS Vector Search.",
      tags: ["Computer Vision", "Vector Search", "AI"],
      featured: false,
      links: []
    },
    {
      title: "Learnix (HackRice Winner)",
      description: "Virtual Ubuntu environment web app for learning UNIX. Best Use of Auth0 winner among 183 participants.",
      tags: ["Next.js", "Docker", "Flask", "Google Cloud"],
      featured: false,
      links: []
    },
    {
      title: "ourwords!",
      description: "Comprehensive AR iOS app utilizing SwiftUI, Unity AR Foundation, ARKit, and Three.js.",
      tags: ["SwiftUI", "ARKit", "Unity", "Three.js"],
      featured: false,
      links: []
    }
  ];

  const experience = [
    {
      date: "Jun 2024 - Aug 2025",
      title: "Full Stack Developer",
      subtitle: "Vector Tech Capital LLC",
      details: [
        "Developed AI-powered RESTful apps leveraging Bittensor ecosystem.",
        "Built full-stack data viz platform with Next.js, AWS EC2, and CI/CD pipelines.",
        "Implemented real-time data analysis with FastAPI and GraphQL."
      ]
    },
    {
      date: "Jun 2024 - Aug 2024",
      title: "Research Assistant",
      subtitle: "Applied-Logic & Systems Lab",
      details: [
        "Emulated commonsense reasoning with constraint answer set programming.",
        "Co-authored a paper accepted to PADL 2025 (Denver, CO).",
        "Presented at International Conference on Language Programming."
      ]
    },
    {
      date: "Jun 2024 - Aug 2024",
      title: "Research Assistant",
      subtitle: "UT Dallas SPUR",
      details: [
        "Engineered Social AR app demo tracking 100+ devices with <100ms latency.",
        "Demonstrated multi-device communication and real-time interaction."
      ]
    },
    {
      date: "Sep 2023 - Dec 2023",
      title: "Research Assistant",
      subtitle: "ACM Research at UTD",
      details: [
        "R&D for Blockchain Federated Learning (BCFL).",
        "Secured federated data sharing between 15+ nodes."
      ]
    }
  ];

  const education = [
    {
      school: "University of Texas at Austin",
      degree: "MS Computer Science",
      year: "2027",
      grade: ""
    },
    {
      school: "University of Texas at Dallas",
      degree: "BS Software Engineering",
      year: "2025",
      grade: "GPA: 3.812"
    },
    {
      school: "Waseda University",
      degree: "Education Abroad (Tokyo)",
      year: "2023",
      grade: "GPA: 4.0"
    }
  ];

  const skills = [
    "JavaScript", "TypeScript", "Python", "Java", "C++", "Rust", "C#", "Swift", "SQL",
    "Git", "Linux", "Docker", "Kubernetes", "Flutter", "Google Cloud", "AWS", "PostgreSQL",
    "React", "Three.js", "Next.js"
  ];

  return (
    <div className="relative min-h-screen text-neutral-800 dark:text-neutral-200 selection:bg-amber-600 dark:selection:bg-[#d2b48c] selection:text-white dark:selection:text-black pointer-events-none transition-colors duration-300">

      {/* Main Content Scroll Wrapper */}
      <div className="relative z-10 max-w-5xl mx-auto px-6 py-20 pointer-events-none">

        {/* Hero Section */}
        <header className="mb-24 flex flex-col md:flex-row justify-between items-start md:items-end border-b border-neutral-200 dark:border-neutral-800 pb-8 pointer-events-auto transition-colors">
          <div>
            <h1 className="text-5xl md:text-7xl font-bold font-mono tracking-tighter text-neutral-900 dark:text-white mb-4 transition-colors">
              Bryant<br />
              <span className="text-amber-700 dark:text-[#d2b48c] transition-colors">Hargreaves</span>
            </h1>
            <p className="text-lg font-mono text-neutral-600 dark:text-neutral-400 max-w-xl leading-relaxed transition-colors">
              <span className="text-amber-600 dark:text-[#d2b48c] mr-2 transition-colors">root@portfolio:~$</span>
              Full Stack Developer & Researcher specializing in distributed systems, AI integration, and real-time communication.
            </p>
          </div>

          <div className="flex gap-4 mt-6 md:mt-0">
            <a href="https://github.com/bluestarburst" target="_blank" rel="noreferrer" className="p-3 border border-neutral-200 dark:border-neutral-800 rounded-full hover:bg-amber-100 dark:hover:bg-[#d2b48c] hover:text-amber-900 dark:hover:text-black transition-all bg-white dark:bg-transparent">
              <Github size={20} />
            </a>
            <a href="https://linkedin.com/in/bryant-hargreaves" target="_blank" rel="noreferrer" className="p-3 border border-neutral-200 dark:border-neutral-800 rounded-full hover:bg-amber-100 dark:hover:bg-[#d2b48c] hover:text-amber-900 dark:hover:text-black transition-all bg-white dark:bg-transparent">
              <Linkedin size={20} />
            </a>
            <a href="mailto:hargreaves.bryant@gmail.com" className="p-3 border border-neutral-200 dark:border-neutral-800 rounded-full hover:bg-amber-100 dark:hover:bg-[#d2b48c] hover:text-amber-900 dark:hover:text-black transition-all bg-white dark:bg-transparent">
              <Mail size={20} />
            </a>
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-3 border border-neutral-200 dark:border-neutral-800 rounded-full hover:bg-amber-100 dark:hover:bg-[#d2b48c] hover:text-amber-900 dark:hover:text-black transition-all bg-white dark:bg-transparent cursor-pointer"
              aria-label="Toggle theme"
            >
              <div className="relative w-5 h-5">
                <Sun className="absolute w-5 h-5 transition-all scale-100 rotate-0 dark:scale-0 dark:-rotate-90" />
                <Moon className="absolute w-5 h-5 transition-all scale-0 rotate-90 dark:scale-100 dark:rotate-0" />
              </div>
            </button>
          </div>
        </header>

        {/* Featured Projects (Priority) */}
        <section className="mb-24 pointer-events-auto">
          <SectionHeader title="Featured Deployments" icon={Terminal} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {projects.filter(p => p.featured).map((project, index) => (
              <ProjectCard key={index} {...project} />
            ))}
          </div>
        </section>

        {/* Other Projects */}
        <section className="mb-24">
          <SectionHeader title="Project Archive" icon={Code} />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
            {projects.filter(p => !p.featured).map((project, index) => (
              <ProjectCard key={index} {...project} />
            ))}
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">

          {/* Left Column: Experience & Research */}
          <div className="lg:col-span-7">
            <section className="mb-16">
              <SectionHeader title="Experience log" icon={Server} />
              <div className="space-y-2">
                {experience.map((item, index) => (
                  <TimelineItem key={index} {...item} />
                ))}
              </div>
            </section>
          </div>

          {/* Right Column: Skills & Education */}
          <div className="lg:col-span-5 space-y-16">

            <section>
              <SectionHeader title="Tech Stack" icon={Cpu} />
              <div className="flex flex-wrap gap-2">
                {skills.map((skill, index) => (
                  <SkillBadge key={index} skill={skill} />
                ))}
              </div>
            </section>

            <section>
              <SectionHeader title="Education" icon={Layers} />
              <div className="space-y-6">
                {education.map((edu, index) => (
                  <div key={index} className="border border-neutral-200 dark:border-neutral-800 p-5 bg-white/30 dark:bg-neutral-900/30 pointer-events-auto backdrop-blur-sm transition-colors">
                    <h3 className="text-neutral-900 dark:text-white font-bold font-mono transition-colors">{edu.school}</h3>
                    <div className="flex justify-between items-center mt-2 text-sm font-mono text-amber-700 dark:text-[#d2b48c] transition-colors">
                      <span>{edu.degree}</span>
                      <span>{edu.year}</span>
                    </div>
                    {edu.grade && <div className="mt-2 text-xs text-neutral-500 font-mono transition-colors">{edu.grade}</div>}
                  </div>
                ))}
              </div>
            </section>

          </div>
        </div>

        <div className="h-screen pointer-events-none"></div>

        {/* Footer */}
        <footer className="mt-24 pt-8 border-t border-neutral-200 dark:border-neutral-800 text-center font-mono text-xs text-neutral-500 dark:text-neutral-600 pointer-events-auto transition-colors">
          <p>© {new Date().getFullYear()} Bryant Hargreaves. Built with React, Three.js & Tailwind.</p>
          <p className="mt-2">System Status: Online</p>
        </footer>

      </div>
    </div>
  );
}

