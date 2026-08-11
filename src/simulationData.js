// simulationData.js

export const SIM = {
  stats: {
    total_bytes: 4_000_000_000_000,
    total_used_raw: 1_340_000_000_000,
    total_avail: 2_660_000_000_000,
  },

  health: {
    status: "HEALTH_OK",
    checks: {},
  },

  vault: {
    mounted: true,
    path: "/vault",
    total: 2_000_000_000_000,
    used: 480_000_000_000,
    free: 1_520_000_000_000,
  },

  buckets: [
    {
      name: "media-assets",
      created: "2024-11-01T10:00:00Z",
    },
    {
      name: "backups-daily",
      created: "2024-12-15T08:30:00Z",
    },
    {
      name: "logs-archive",
      created: "2025-01-20T14:00:00Z",
    },
    {
      name: "ml-datasets",
      created: "2025-03-05T09:15:00Z",
    },
  ],

  objects: {
    "media-assets": [
      {
        key: "hero-banner.png",
        size: 4200000,
        modified: "2025-05-10T12:00:00Z",
      },
      {
        key: "video-promo.mp4",
        size: 187000000,
        modified: "2025-05-15T09:30:00Z",
      },
      {
        key: "icons/arrow.svg",
        size: 2100,
        modified: "2025-06-01T11:00:00Z",
      },
    ],

    "backups-daily": [
      {
        key: "db-2025-06-12.tar.gz",
        size: 930000000,
        modified: "2025-06-12T03:00:00Z",
      },
      {
        key: "db-2025-06-11.tar.gz",
        size: 918000000,
        modified: "2025-06-11T03:00:00Z",
      },
    ],

    "logs-archive": [
      {
        key: "app-2025-05.log.gz",
        size: 45000000,
        modified: "2025-06-01T00:00:00Z",
      },
    ],

    "ml-datasets": [
      {
        key: "training-v3.parquet",
        size: 2100000000,
        modified: "2025-04-20T16:00:00Z",
      },
      {
        key: "validation.parquet",
        size: 210000000,
        modified: "2025-04-20T16:05:00Z",
      },
    ],
  },

  policies: [
    { id: "none", name: "No Policy", description: "Keep data forever", expire_days: null, builtin: true },
    { id: "keep7", name: "Keep 7 Days", description: "Delete objects after 7 days", expire_days: 7, builtin: true },
    { id: "keep30", name: "Keep 30 Days", description: "Delete objects after 30 days", expire_days: 30, builtin: true },
    { id: "keep90", name: "Keep 90 Days", description: "Delete objects after 90 days", expire_days: 90, builtin: true },
    { id: "keep365", name: "Keep 1 Year", description: "Delete objects after 365 days", expire_days: 365, builtin: true },
  ],
  bucketSettings: {
    "media-assets": { lifecycle: "none" },
    "backups-daily": { lifecycle: "keep30" },
    "logs-archive": { lifecycle: "keep90" },
    "ml-datasets": { lifecycle: "none" },
  },
  bucketPolicies: {},

  rgwUsers: [
    "admin",
    "app-user",
    "backup-svc",
    "ml-worker",
  ],

  rbdImages: [
    {
      name: "vm-root-disk",
      size: 107374182400,
      format: 2,
      features: ["layering", "exclusive-lock"],
    },
    {
      name: "db-volume",
      size: 53687091200,
      format: 2,
      features: ["layering"],
    },
    {
      name: "scratch-disk",
      size: 10737418240,
      format: 2,
      features: [],
    },
  ],

  mapped: [
    {
      device: "/dev/rbd0",
      pool: "rbd",
      name: "vm-root-disk",
    },
  ],

  cephfs: {
    "": [
      {
        name: "data",
        type: "dir",
        size: 0,
        modified: "1749000000",
      },
      {
        name: "home",
        type: "dir",
        size: 0,
        modified: "1748900000",
      },
      {
        name: "shared",
        type: "dir",
        size: 0,
        modified: "1749100000",
      },
      {
        name: "README.md",
        type: "file",
        size: 1240,
        modified: "1748800000",
      },
    ],

    data: [
      {
        name: "exports",
        type: "dir",
        size: 0,
        modified: "1749000000",
      },
      {
        name: "pipeline-output.csv",
        type: "file",
        size: 5800000,
        modified: "1749010000",
      },
      {
        name: "config.yaml",
        type: "file",
        size: 3200,
        modified: "1748950000",
      },
    ],
  },

  activity: [
    {
      time: "2025-06-13 10:42:11",
      action: "UPLOAD",
      target: "media-assets/hero-banner.png",
      status: "success",
      detail: "Saved to Ceph Object Storage",
      vault: false,
    },

    {
      time: "2025-06-13 10:40:05",
      action: "VAULT SYNC",
      target: "backups-daily/db-2025-06-12.tar.gz",
      status: "success",
      detail: "Copied to /vault/object/backups-daily/",
      vault: true,
    },

    {
      time: "2025-06-13 10:38:22",
      action: "CREATE BUCKET",
      target: "ml-datasets",
      status: "success",
      detail:
        "Owner:ml-worker ACL:private Versioning:true ObjLock:false",
      vault: false,
    },

    {
      time: "2025-06-13 10:35:00",
      action: "MAP IMAGE",
      target: "vm-root-disk",
      status: "success",
      detail: "Device: /dev/rbd0",
      vault: false,
    },

    {
      time: "2025-06-13 10:30:48",
      action: "VAULT EXPORT (RBD)",
      target: "db-volume",
      status: "success",
      detail: "Exported to /vault/block/db-volume.img",
      vault: true,
    },
  ],
};