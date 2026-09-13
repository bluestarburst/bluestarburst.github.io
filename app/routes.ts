import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("portfolio", "portfolio/portfolio.tsx"),
  route("privacy", "routes/privacy.tsx"),
] satisfies RouteConfig;
