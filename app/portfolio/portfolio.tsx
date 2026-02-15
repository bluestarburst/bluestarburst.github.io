import type { Route } from "./+types/portfolio";

export const meta: Route.MetaFunction = () => {
  return [
    { title: "Bryant Hargreaves - Portfolio" },
    { name: "description", content: "Full-stack developer and creative technologist" },
  ];
};

interface Experience {
  title: string;
  company: string;
  period: string;
  description: string[];
}

interface Skill {
  category: string;
  items: string[];
}

interface Education {
  degree: string;
  school: string;
  year: string;
  details?: string;
}

const experiences: Experience[] = [
  {
    title: "Full Stack Developer",
    company: "Current Role",
    period: "Recent",
    description: [
      "Developed full-stack applications using TypeScript, React, and Node.js",
      "Implemented real-time communication features and collaborative tools",
      "Optimized performance and user experience across multiple platforms",
    ],
  },
];

const skills: Skill[] = [
  {
    category: "Frontend",
    items: [
      "React",
      "TypeScript",
      "Vite",
      "Tailwind CSS",
      "React Router",
      "Web APIs",
    ],
  },
  {
    category: "Backend",
    items: [
      "Node.js",
      "Express",
      "Full-stack Architecture",
      "APIs & REST",
    ],
  },
  {
    category: "Tools & Technologies",
    items: [
      "Git & GitHub",
      "Docker",
      "Real-time Communication",
      "Web3 Technologies",
    ],
  },
];

const education: Education[] = [
  {
    degree: "Full Stack Development",
    school: "Self-taught / Bootcamp",
    year: "Recent",
    details: "Continuous learning in web technologies and software engineering",
  },
];

export default function Portfolio() {
  return (
    <main className="min-h-screen bg-linear-to-b from-slate-900 to-slate-800 text-gray-100">
      {/* Header */}
      <section className="pt-20 pb-12 px-4">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-5xl font-bold mb-4">Bryant Hargreaves</h1>
          <p className="text-2xl text-blue-400 mb-4">
            Full-Stack Developer & Creative Technologist
          </p>
          <p className="text-lg text-gray-300 max-w-2xl">
            Building innovative web experiences with modern technologies. 
            Passionate about open-source, real-time systems, and pushing the 
            boundaries of what's possible on the web.
          </p>
        </div>
      </section>

      {/* Quick Links */}
      <section className="px-4 pb-12 border-b border-slate-700">
        <div className="max-w-4xl mx-auto">
          <div className="flex gap-4 flex-wrap">
            <a
              href="https://github.com/bluestarburst"
              target="_blank"
              rel="noreferrer"
              className="px-6 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg transition"
            >
              GitHub
            </a>
            <a
              href="mailto:contact@example.com"
              className="px-6 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition"
            >
              Email
            </a>
          </div>
        </div>
      </section>

      {/* Experience */}
      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold mb-8">Experience</h2>
          <div className="space-y-8">
            {experiences.map((exp, idx) => (
              <div key={idx} className="border-l-2 border-blue-500 pl-6">
                <h3 className="text-2xl font-semibold text-blue-400">
                  {exp.title}
                </h3>
                <p className="text-lg text-gray-300">{exp.company}</p>
                <p className="text-sm text-gray-400 mb-4">{exp.period}</p>
                <ul className="space-y-2">
                  {exp.description.map((desc, i) => (
                    <li key={i} className="text-gray-300 flex items-start">
                      <span className="text-blue-400 mr-3">▸</span>
                      <span>{desc}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Skills */}
      <section className="py-16 px-4 bg-slate-800/50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold mb-8">Skills & Technologies</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {skills.map((skillGroup, idx) => (
              <div key={idx}>
                <h3 className="text-xl font-semibold text-blue-400 mb-4">
                  {skillGroup.category}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {skillGroup.items.map((skill, i) => (
                    <span
                      key={i}
                      className="px-3 py-1 bg-slate-700 text-gray-200 rounded-full text-sm hover:bg-blue-500 transition"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Education */}
      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold mb-8">Education</h2>
          <div className="space-y-6">
            {education.map((edu, idx) => (
              <div key={idx} className="border-l-2 border-blue-500 pl-6">
                <h3 className="text-2xl font-semibold text-blue-400">
                  {edu.degree}
                </h3>
                <p className="text-lg text-gray-300">{edu.school}</p>
                <p className="text-sm text-gray-400">{edu.year}</p>
                {edu.details && (
                  <p className="text-gray-300 mt-2">{edu.details}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Projects */}
      <section className="py-16 px-4 bg-slate-800/50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold mb-8">Featured Projects</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ProjectCard
              title="Pluto RTC"
              description="Real-time communication library with modern web standards"
              tech={["TypeScript", "WebRTC", "Real-time"]}
              href="https://github.com/bluestarburst/pluto-rtc"
            />
            <ProjectCard
              title="Portfolio Website"
              description="Modern portfolio site with interactive components"
              tech={["React", "TypeScript", "Vite", "Tailwind CSS"]}
              href="https://github.com/bluestarburst/bluestarburst.github.io"
            />
          </div>
        </div>
      </section>

      {/* Footer */}
      <section className="py-12 px-4 border-t border-slate-700">
        <div className="max-w-4xl mx-auto text-center text-gray-400">
          <p>&copy; 2024 Bryant Hargreaves. All rights reserved.</p>
          <p className="mt-2 text-sm">
            Built with React, TypeScript, and Vite
          </p>
        </div>
      </section>
    </main>
  );
}

function ProjectCard({
  title,
  description,
  tech,
  href,
}: {
  title: string;
  description: string;
  tech: string[];
  href: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="group p-6 bg-slate-700/50 rounded-lg border border-slate-600 hover:border-blue-500 hover:bg-slate-700 transition duration-300"
    >
      <h3 className="text-xl font-semibold text-blue-400 group-hover:text-blue-300 mb-2">
        {title} →
      </h3>
      <p className="text-gray-300 mb-4">{description}</p>
      <div className="flex flex-wrap gap-2">
        {tech.map((t, idx) => (
          <span key={idx} className="text-xs px-2 py-1 bg-slate-600 text-gray-200 rounded">
            {t}
          </span>
        ))}
      </div>
    </a>
  );
}
