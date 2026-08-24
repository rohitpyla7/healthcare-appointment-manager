import "./globals.css";
import type { Metadata } from "next";
export const metadata: Metadata={title:"CareFlow | Healthcare Appointment Manager",description:"Healthcare appointment booking, visit summaries and follow-up management."};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
