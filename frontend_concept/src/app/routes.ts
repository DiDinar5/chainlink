import { createBrowserRouter } from "react-router";
import { Layout } from "./components/Layout";
import { InvestorDashboard } from "./components/InvestorDashboard";
import { IssuerPortal } from "./components/IssuerPortal";
import { AssetsPage } from "./components/AssetsPage";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Layout,
    children: [
      { index: true, Component: InvestorDashboard },
      { path: "assets", Component: AssetsPage },
      { path: "issuer", Component: IssuerPortal },
    ],
  },
]);
