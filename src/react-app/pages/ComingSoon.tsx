import { motion } from "framer-motion";
import { Header } from "../components/Common/Header";

interface ComingSoonProps {
  title: string;
  subtitle?: string;
}

export default function ComingSoon({ title, subtitle }: ComingSoonProps) {
  return (
    <>
      <Header />
      <motion.section
        className="coming-soon"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
      >
        <h1 className="coming-soon-title">{title}</h1>
        <div className="coming-soon-seal">敬请期待</div>
        {subtitle && <p className="coming-soon-subtitle">{subtitle}</p>}
      </motion.section>
    </>
  );
}
