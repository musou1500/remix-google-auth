import type { LoaderFunction } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";

export const loader: LoaderFunction = ({ context }) => {
  return { user: context.user };
};

export default function Index() {
  const { user } = useLoaderData();
  return <h1>Hello, {user.name}!</h1>;
}
