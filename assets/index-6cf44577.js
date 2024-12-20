import{r as g,j as p,m as e,c as re,N as ce,a as le,R as ae,H as ue,b as de}from"./vendor-11d3d1d8.js";(function(){const b=document.createElement("link").relList;if(b&&b.supports&&b.supports("modulepreload"))return;for(const i of document.querySelectorAll('link[rel="modulepreload"]'))y(i);new MutationObserver(i=>{for(const l of i)if(l.type==="childList")for(const h of l.addedNodes)h.tagName==="LINK"&&h.rel==="modulepreload"&&y(h)}).observe(document,{childList:!0,subtree:!0});function m(i){const l={};return i.integrity&&(l.integrity=i.integrity),i.referrerPolicy&&(l.referrerPolicy=i.referrerPolicy),i.crossOrigin==="use-credentials"?l.credentials="include":i.crossOrigin==="anonymous"?l.credentials="omit":l.credentials="same-origin",l}function y(i){if(i.ep)return;i.ep=!0;const l=m(i);fetch(i.href,l)}})();const fe=`#root{background-color:#fff;color:#ffffffde;color-scheme:light;font-family:Inter,Avenir,Helvetica,Arial,sans-serif;font-size:16px;font-synthesis:none;font-weight:400;height:100vh;line-height:24px;margin:0;padding:0;text-rendering:optimizeLegibility;width:100vw;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;-webkit-text-size-adjust:100%}a{color:#646cff;font-weight:500;text-decoration:inherit}a:hover{color:#535bf2}body{display:flex;margin:0;min-height:100vh;min-width:320px;place-items:center}h1{font-size:3.2em;line-height:1.1}button{background-color:#1a1a1a;border:1px solid transparent;border-radius:8px;cursor:pointer;font-family:inherit;font-size:1em;font-weight:500;padding:.6em 1.2em;transition:border-color .25s}button:hover{border-color:#646cff}button:focus,button:focus-visible{outline:4px auto -webkit-focus-ring-color}@media (prefers-color-scheme:light){#root{background-color:#fff;color:#213547}a:hover{color:#747bff}button{background-color:#f9f9f9}}
`;const J="/assets/react-35ef61ed.svg",Q="/vite.svg",ge="/assets/plug3-f4b3698f.png",he="/assets/plug2-fcde437e.png",pe="/assets/outlet-2a34fa6c.png",me="/assets/wallsocket-880de703.png",X=g.createContext({theme:"light",setTheme:()=>{console.warn("no theme provider")}});function ye(M){const[b,m]=g.useState("light");return p.jsx(X.Provider,{value:{theme:b,setTheme:m},children:M.children})}function xe(){const{theme:M,setTheme:b}=g.useContext(X),m=g.useRef(null),y=g.useRef(null),i=g.useRef({}),l=g.useRef(!1);g.useRef(!1);const h=g.useRef(e.Engine.create()),F=g.useRef(e.Runner.create()),d=g.useRef(null),[T,Y]=g.useState({outlet2:!0}),[H,Z]=g.useState(!1);function _(){console.log("App mounted"),i.current={};const c=window.innerWidth,r=window.innerHeight;if(m.current&&m.current.children.length==0&&(console.log("Creating canvas"),d.current=e.Render.create({element:m.current,engine:h.current,options:{width:c,height:r,wireframes:!1,background:"transparent",showCollisions:!0,showVelocity:!0}})),d.current)console.log("Render created");else{console.log("Render not created");return}e.World.add(h.current.world,[e.Bodies.rectangle(-10,r/2,20,r*3,{isStatic:!0}),e.Bodies.rectangle(c/2,r+10,c,20,{isStatic:!0}),e.Bodies.rectangle(c+10,r/2,20,r*3,{isStatic:!0})]),e.Runner.run(F.current,h.current),e.Render.run(d.current);const w=1,v=2;function V(n,o,a){const u=e.Composites.stack(n,o,a,1,20,10,function(s,P){return e.Bodies.rectangle(s,P,50,20,{collisionFilter:{category:v,group:v}})}),t=e.Bodies.circle(n+50*a,o,40,{density:.001,label:Math.random().toString(36).substring(7),collisionFilter:{group:v,category:v,mask:-1}});return e.Composite.add(u,t),e.Composites.chain(u,.5,0,-.5,0,{stiffness:.4,length:40,render:{type:"line"}}),e.Composite.add(u,e.Constraint.create({bodyB:u.bodies[0],pointB:{x:-25,y:0},pointA:{x:u.bodies[0].position.x,y:u.bodies[0].position.y},stiffness:.5})),[u,t]}const f=e.Bodies.rectangle(c*9/10,r/2+95/2,130,200,{isStatic:!0,collisionFilter:{mask:w},frictionAir:.1}),O=e.Bodies.rectangle(f.position.x,f.position.y-45,40,40,{isStatic:!0,collisionFilter:{mask:v},label:"outlet1"}),W=e.Bodies.rectangle(f.position.x,f.position.y+45,40,40,{isStatic:!0,collisionFilter:{mask:v},label:"outlet2"});e.World.add(h.current.world,[O,W,f]);const[A,ee]=V(c/4,-300,r/80),[te,D]=V(c+300,r+100,7),U=[O,W],z=[A,te],q=[ee,D],L=[[D,W]];e.Composite.add(h.current.world,z);const S=e.Mouse.create(d.current.canvas),K=e.MouseConstraint.create(h.current,{mouse:S,constraint:{stiffness:.2,render:{visible:!0}}});e.Composite.add(h.current.world,K),d.current.mouse=S;const C=new Image(150,150);C.src=ge,C.onload=()=>{d.current.textures[J]=C};const B=new Image(125,125);B.src=he,B.onload=()=>{d.current.textures[J]=B};function oe(n,o){const a=n.bodies,u=n.bodies[n.bodies.length-1];if(i.current[u.label]){const j=n.bodies.length-2,x=n.bodies[j+1];o.drawImage(B,x.position.x-B.width/2,x.position.y-B.height/2,B.width,B.height)}for(let j=1;j<a.length;j+=1){const x=a[j-1],E=a[j],$={x:x.position.x+30*Math.cos(x.angle),y:x.position.y+30*Math.sin(x.angle)},G={x:E.position.x-30*Math.cos(E.angle),y:E.position.y-30*Math.sin(E.angle)};o.beginPath(),o.moveTo(x.position.x,x.position.y),o.bezierCurveTo($.x,$.y,G.x,G.y,E.position.x,E.position.y),o.strokeStyle="black",o.lineWidth=20,o.stroke(),o.strokeStyle="white",o.lineWidth=16,o.stroke()}if(i.current[u.label])return;const t=n.bodies.length-1,s=n.bodies[t],P=s.angle;o.save(),o.translate(s.position.x,s.position.y),o.rotate(P),o.drawImage(C,-C.width/2,-C.height/2,C.width,C.height),o.restore()}const R=new Image(125,125);R.src=pe,R.onload=()=>{d.current.textures[Q]=R};const k=new Image(275,275);k.src=me,k.onload=()=>{d.current.textures[Q]=k};function ne(n,o){n.drawImage(k,o.position.x-k.width/2,o.position.y-k.height/2,k.width,k.height)}function ie(n,o){n.drawImage(R,o.position.x-R.width/2,o.position.y-R.height/2,R.width,R.height)}function se(n,o){var u,t;const a=n.bodies[n.bodies.length-1];return l.current?((u=e.Collision.collides(o,n.bodies[n.bodies.length-1]))==null?void 0:u.collided)??!1:(t=e.Collision.collides(o,n.bodies[n.bodies.length-1]))!=null&&t.collided?(console.log("Connected"),console.log("Checking connection",a.label,o.label,q),i.current[a.label]===o||(i.current[a.label]&&(console.log("Disconnecting"),o.collisionFilter.mask=v,e.Composite.remove(n,n.constraints[n.constraints.length-1])),i.current[a.label]=o,e.Body.setPosition(n.bodies[n.bodies.length-1],{x:o.position.x,y:o.position.y}),e.Composite.add(n,e.Constraint.create({bodyB:n.bodies[n.bodies.length-1],pointB:{x:0,y:0},pointA:{x:o.position.x,y:o.position.y},stiffness:.1})),o.collisionFilter.mask=w,l.current=!0,setTimeout(()=>{l.current=!1},1e3)),!0):(i.current[a.label]===o&&(console.log("Disconnected"),e.Composite.remove(n,n.constraints[n.constraints.length-1]),i.current[a.label]=null,o.collisionFilter.mask=v),!1)}let I={x:-1,y:-1};setTimeout(()=>{l.current=!1},1e3),e.Events.on(h.current,"afterUpdate",function(){var o,a,u;const n=(o=y.current)==null?void 0:o.getContext("2d");if(n){if(Object.values(i.current).filter(t=>t&&t.label==="outlet2").length===0?n.filter="invert(1)":n.filter="none",L.length>0)for(let t=0;t<L.length;t++){const s=L[t][0],P=L[t][1];i.current[s.label]===P?L.splice(t,1):e.Body.setPosition(s,{x:s.position.x+(P.position.x-s.position.x)/1.5,y:s.position.y+(P.position.y-s.position.y)/1.5})}K.body==f?(I.x==-1&&I.y==-1&&(I={x:f.position.x-S.position.x,y:f.position.y-S.position.y}),console.log("Wall is being dragged",I),e.Body.setPosition(f,{x:S.position.x+I.x,y:S.position.y+I.y}),z.forEach(t=>{const s=t.bodies[t.bodies.length-1];i.current[s.label]&&(e.Body.setPosition(s,{x:i.current[s.label].position.x,y:i.current[s.label].position.y}),e.Composite.remove(t,t.constraints[t.constraints.length-1]),e.Composite.add(t,e.Constraint.create({bodyB:t.bodies[t.bodies.length-1],pointB:{x:0,y:0},pointA:{x:i.current[s.label].position.x,y:i.current[s.label].position.y},stiffness:.1})))})):I={x:-1,y:-1},e.Body.setAngle(f,0),e.Body.setPosition(O,{x:f.position.x,y:f.position.y-45}),e.Body.setPosition(W,{x:f.position.x,y:f.position.y+45}),(u=(a=y.current)==null?void 0:a.getContext("2d"))==null||u.clearRect(0,0,y.current.width,y.current.height),ne(n,f),z.forEach(t=>{U.forEach(s=>{se(t,s)})}),U.forEach(t=>{ie(n,t)}),z.forEach(t=>{oe(t,n)}),q.forEach(t=>{(t.position.x<0||t.position.x>c)&&(e.Body.setVelocity(t,{x:0,y:0}),e.Body.setPosition(t,{x:t.position.x+(c/2-t.position.x)/10,y:t.position.y})),(t.position.y<0||t.position.y>r)&&(e.Body.setVelocity(t,{x:0,y:0}),e.Body.setPosition(t,{x:t.position.x,y:t.position.y+(r/2-t.position.y)/10}))})}})}function N(){console.log("Resizing canvas");const c=window.innerWidth,r=window.innerHeight;d.current.canvas.height=r,d.current.canvas.width=c,d.current.bounds.max.x=c,d.current.bounds.max.y=r;const w=y.current;w&&(w.setAttribute("width",c.toString()),w.setAttribute("height",r.toString()),w.style.width=c+"px",w.style.height=r+"px")}return g.useEffect(()=>{if(!H){Z(!0);return}return console.log("App mounted"),m.current&&(m.current.innerHTML="",_()),N(),setInterval(()=>{Y(Object.values(i.current).reduce((c,r)=>(r&&(c[r.label]=!0),c),{}))},100),window.addEventListener("resize",N),()=>{console.log("App unmounted"),i.current={},e.Runner.stop(F.current),d.current&&e.Render.stop(d.current),e.World.clear(h.current.world,!1),m.current&&(m.current.innerHTML="")}},[H]),g.useEffect(()=>{T.outlet2?b("light"):b("dark"),console.log("Powered:",T)},[T]),p.jsxs("div",{className:re("h-screen w-screen",M==="light"?"bg-white":"bg-black"),children:[p.jsx("div",{ref:m,className:"h-screen w-screen opacity-10"}),p.jsx("canvas",{ref:y,className:"absolute left-0 top-0 h-full w-full",style:{pointerEvents:"none"}}),T.outlet1&&p.jsx("div",{})]})}function be(){return p.jsx(ce,{children:p.jsx(ye,{children:p.jsx(xe,{})})})}const we={};le.createRoot(document.getElementById("root")).render(p.jsx(ae.StrictMode,{children:p.jsxs(ue,{context:we,children:[p.jsx(de,{children:p.jsx("style",{children:fe})}),p.jsx(be,{})]})}));
