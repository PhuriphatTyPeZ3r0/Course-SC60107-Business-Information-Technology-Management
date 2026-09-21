"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Icon } from "@/components/icon";
import { buttonVariants } from "@/components/ui/button";
import { SiteHeader } from "@/components/site-header";
import { HeroScene } from "@/components/hero-scene";
import { useLanguage } from "@/lib/i18n/context";
import { useMounted } from "@/lib/hooks/use-mounted";
import { glassSpring } from "@/lib/motion";

export default function Home() {
  const { t } = useLanguage();
  const mounted = useMounted();

  const features = [
    { icon: "graphic_eq", title: t.landing.feature1Title, body: t.landing.feature1Body },
    { icon: "group", title: t.landing.feature2Title, body: t.landing.feature2Body },
    { icon: "checklist", title: t.landing.feature3Title, body: t.landing.feature3Body },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <section className="relative flex flex-1 items-center overflow-hidden">
        <div className="absolute inset-0">
          <HeroScene />
        </div>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />

        <div className="relative z-10 mx-auto max-w-3xl px-6 py-32 text-center">
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={mounted ? { opacity: 1, y: 0 } : undefined}
            transition={{ duration: 0.6 }}
            className="mb-4 text-sm font-medium uppercase tracking-widest text-accent"
          >
            {t.landing.eyebrow}
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={mounted ? { opacity: 1, y: 0 } : undefined}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="glow-text text-4xl font-bold tracking-tight sm:text-6xl"
          >
            {t.landing.title}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={mounted ? { opacity: 1, y: 0 } : undefined}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground"
          >
            {t.landing.subtitle}
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={mounted ? { opacity: 1, y: 0 } : undefined}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mt-10 flex items-center justify-center gap-3"
          >
            <Link href="/login" className={buttonVariants({ size: "lg" })}>
              {t.landing.cta}
            </Link>
            <Link
              href="/login"
              className={buttonVariants({ size: "lg", variant: "outline", className: "border-white/20" })}
            >
              {t.landing.ctaSecondary}
            </Link>
          </motion.div>
        </div>
      </section>

      <section className="relative border-t border-white/10 bg-background/60 py-24">
        <div className="mx-auto max-w-6xl px-6">
          <motion.h2
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="mb-12 text-center text-2xl font-semibold sm:text-3xl"
          >
            {t.landing.featuresTitle}
          </motion.h2>
          <div className="grid gap-6 sm:grid-cols-3">
            {features.map((feature, i) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ ...glassSpring, delay: i * 0.1 }}
                className="glass-panel rounded-2xl p-6"
              >
                <Icon name={feature.icon} className="mb-4 text-[32px] text-primary" />
                <h3 className="mb-2 font-semibold">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">{feature.body}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
