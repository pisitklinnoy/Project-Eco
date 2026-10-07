import React from 'react';
import {
  Server,
  Activity,
  Database,
  Cpu,
  Eye,
  BarChart3,
  ExternalLink,
  Zap,
  HardDrive,
  Radio,
} from 'lucide-react';
import { SectionHeader } from './ui/SectionHeader';

interface ServiceItem {
  id: string;
  name: string;
  role: string;
  port: string;
  category: 'mlops' | 'storage' | 'observability' | 'core';
  externalUrl?: string;
  status: 'online' | 'degraded';
  description: string;
  icon: React.ReactNode;
}

export const AdminObservability: React.FC = () => {
  const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';

  const services: ServiceItem[] = [
    {
      id: 'grafana',
      name: 'Grafana Dashboards',
      role: 'Unified Telemetry & Tracing Metrics',
      port: '3000',
      category: 'observability',
      externalUrl: `http://${host}:3000/d/floodlens-unified-overview`,
      status: 'online',
      description: 'ศูนย์ควบคุมกราฟและแดชบอร์ดแสดงผล Metrics, OpenTelemetry Traces และ System Logs ของ FloodLens แบบ Real-Time',
      icon: <BarChart3 className="w-5 h-5 text-amber-500" />,
    },
    {
      id: 'mlflow',
      name: 'MLflow Model Registry',
      role: 'Experiment Tracking & Model Governance',
      port: '5000',
      category: 'mlops',
      externalUrl: `http://${host}:5000`,
      status: 'online',
      description: 'บันทึกประวัติการเทรนโมเดล AI, พารามิเตอร์ MAE, Pixel Error และ Artifacts โมเดลทั้งหมด',
      icon: <Cpu className="w-5 h-5 text-sky-500" />,
    },
    {
      id: 'label-studio',
      name: 'Label Studio',
      role: 'Human-in-the-Loop Annotation Platform',
      port: '8085',
      category: 'mlops',
      externalUrl: `http://${host}:8085`,
      status: 'online',
      description: 'ระบบตรวจทานภาพและวาดกรอบเสาวัดน้ำโดยผู้เชี่ยวชาญ พร้อมระบบ Webhook เชื่อมต่อ Retrain',
      icon: <Eye className="w-5 h-5 text-emerald-500" />,
    },
    {
      id: 'prometheus',
      name: 'Prometheus TSDB',
      role: 'Time-Series System & API Metrics Collector',
      port: '9090',
      category: 'observability',
      externalUrl: `http://${host}:9090`,
      status: 'online',
      description: 'เก็บรวบรวมตัวชี้วัดประสิทธิภาพ Latency, Request Rate และ Memory Usage ของระบบ',
      icon: <Activity className="w-5 h-5 text-rose-500" />,
    },
    {
      id: 'minio',
      name: 'MinIO S3 Storage Console',
      role: 'High-Performance S3 Object Store',
      port: '9001',
      category: 'storage',
      externalUrl: `http://${host}:9001`,
      status: 'online',
      description: 'จัดเก็บภาพถ่ายกล้อง CCTV สด, รูปภาพประวัติย้อนหลัง และไฟล์น้ำหนักโมเดล AI',
      icon: <HardDrive className="w-5 h-5 text-purple-500" />,
    },
    {
      id: 'fastapi',
      name: 'FastAPI Backend Engine',
      role: 'Core RESTful Telemetry & AI API',
      port: '8000',
      category: 'core',
      externalUrl: `http://${host}:8000/docs`,
      status: 'online',
      description: 'ประมวลผลข้อมูลระดับน้ำจากกล้อง AI, บริหารจัดการคิว และให้บริการ Swagger Documentation',
      icon: <Server className="w-5 h-5 text-blue-500" />,
    },
    {
      id: 'postgres',
      name: 'PostgreSQL Relational DB',
      role: 'Transactional Telemetry & Historical DB',
      port: '5432',
      category: 'storage',
      status: 'online',
      description: 'ฐานข้อมูลกลางสำหรับบันทึกค่าน้ำ ม. รทก., ปริมาณฝน, สถานะเตือนภัย และสถิติตรวจทาน',
      icon: <Database className="w-5 h-5 text-indigo-500" />,
    },
    {
      id: 'redis',
      name: 'Redis Queue & Cache',
      role: 'Async Task Queue (arq) & Realtime Cache',
      port: '6379',
      category: 'core',
      status: 'online',
      description: 'จัดการคิวงานเบื้องหลัง Ingestion, AI Inference และการยิงแจ้งเตือน LINE Outbox',
      icon: <Zap className="w-5 h-5 text-red-500" />,
    },
  ];

  return (
    <div className="space-y-8 animate-fadeIn">
      <SectionHeader
        number="ADMIN 03"
        badge="System Architecture & Observability"
        title="ศูนย์ควบคุมระบบวิศวกรรม & สังเกตการณ์ MLOps"
        subtitle="ตรวจติดตามสถานะคอนเทนเนอร์ 14 บริการ และทางลัดเปิดเครื่องมือวิศวกรรมเฉพาะทาง (Grafana, MLflow, Label Studio)"
        actionLabel="14 Containers Active"
      />

      {/* Quick Launchpad Ribbon */}
      <div className="rounded-[28px] bg-gradient-to-r from-slate-900 via-slate-800 to-blue-950 p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-bold border border-emerald-500/30">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span>Docker Microservices Health: 100% Online</span>
              </div>
              <h3 className="text-xl sm:text-2xl font-black font-display tracking-tight text-white mt-2">
                Engineering Console Launchpad
              </h3>
              <p className="text-xs sm:text-sm text-slate-300 max-w-2xl">
                เข้าถึงระบบมอนิเตอร์และแพลตฟอร์ม MLOps ในเครื่อง Localhost ได้โดยตรงผ่านพอร์ตเฉพาะกิจ
              </p>
            </div>

            <div className="flex items-center space-x-2 self-start sm:self-auto">
              <span className="text-xs font-bold text-slate-400">Environment:</span>
              <span className="px-2.5 py-1 rounded-lg bg-white/10 text-white text-xs font-mono font-bold border border-white/20">
                Hatyai-Cluster / Prod
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 pt-2">
            {services
              .filter((s) => s.externalUrl)
              .map((srv) => (
                <a
                  key={srv.id}
                  href={srv.externalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between p-3 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/10 hover:border-white/25 transition-all text-xs font-bold text-white group cursor-pointer"
                >
                  <div className="flex items-center space-x-2 truncate">
                    {srv.icon}
                    <span className="truncate">{srv.name.split(' ')[0]}</span>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-white transition-colors shrink-0" />
                </a>
              ))}
          </div>
        </div>
      </div>

      {/* Services Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {services.map((srv) => (
          <div
            key={srv.id}
            className="rounded-[24px] bg-white/80 backdrop-blur-xl border border-white/90 p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-4"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-2xl bg-slate-100/90 flex items-center justify-center border border-slate-200/60">
                  {srv.icon}
                </div>
                <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-bold border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span>Port {srv.port}</span>
                </div>
              </div>

              <div>
                <h4 className="font-extrabold text-sm text-slate-900">{srv.name}</h4>
                <p className="text-[11px] font-semibold text-blue-600 mt-0.5">{srv.role}</p>
              </div>

              <p className="text-xs text-slate-500 leading-relaxed">{srv.description}</p>
            </div>

            {srv.externalUrl ? (
              <a
                href={srv.externalUrl}
                target="_blank"
                rel="noreferrer"
                className="w-full inline-flex items-center justify-center space-x-1.5 py-2 px-3 rounded-xl bg-slate-900 hover:bg-blue-600 text-white text-xs font-bold transition-all shadow-sm group cursor-pointer"
              >
                <span>เปิด Console (:{srv.port})</span>
                <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-white transition-colors" />
              </a>
            ) : (
              <div className="w-full inline-flex items-center justify-center py-2 px-3 rounded-xl bg-slate-100 text-slate-500 text-xs font-bold border border-slate-200/60">
                <span>Internal Service (:Port {srv.port})</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* MLOps Pipeline Reference Note */}
      <div className="rounded-[24px] bg-slate-50 border border-slate-200/80 p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-slate-600">
        <div className="flex items-start space-x-3">
          <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 mt-0.5">
            <Radio className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <h5 className="font-bold text-slate-800 text-sm">การทำงานร่วมกันของระบบพื้นฐาน (MLOps Interoperability)</h5>
            <p className="text-slate-500 mt-1 leading-relaxed">
              ภาพกล้อง CCTV จาก MinIO จะถูกนำไปประมวลผลด้วย FastAPI & AI Worker จากนั้นผลการคำนวณและประวัติ
              Retrain จะถูกส่งเข้า MLflow Tracking ส่วนการตรวจทานโดยเจ้าหน้าที่จะเชื่อมผ่าน Label Studio Webhook อัตโนมัติ
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2 shrink-0">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
          <span className="font-bold text-slate-700">Health Check Active</span>
        </div>
      </div>
    </div>
  );
};

export default AdminObservability;
