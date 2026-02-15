import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("portfolio", "portfolio/portfolio.tsx"),
] satisfies RouteConfig;
