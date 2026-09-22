// Mock dataset simulating aggregated records from Google Scholar, Scopus and ORCID
// This will be replaced by live API connectors in later development sprints.

const FACULTY = [
  {
    "id": "F001",
    "name": "Dr. Anjali Mehta",
    "designation": "Professor",
    "department": "Computer Science & Engineering",
    "email": "anjali.mehta@university.edu",
    "orcid": "0000-0002-1825-0097",
    "photo": "initials",
    "hIndex": 21,
    "i10Index": 34,
    "totalCitations": 2140,
    "totalPublications": 58,
    "researchAreas": [
      "Machine Learning",
      "Computer Vision",
      "Data Mining"
    ],
    "sources": {
      "googleScholar": {
        "connected": true,
        "citations": 2140,
        "hIndex": 21
      },
      "scopus": {
        "connected": true,
        "citations": 1980,
        "hIndex": 19
      },
      "orcid": {
        "connected": true,
        "works": 58
      }
    },
    "yearWise": [
      {
        "year": 2021,
        "publications": 6,
        "citations": 240
      },
      {
        "year": 2022,
        "publications": 9,
        "citations": 410
      },
      {
        "year": 2023,
        "publications": 11,
        "citations": 560
      },
      {
        "year": 2024,
        "publications": 13,
        "citations": 610
      },
      {
        "year": 2025,
        "publications": 10,
        "citations": 320
      }
    ]
  },
  {
    "id": "F002",
    "name": "Dr. Rakesh Sharma",
    "designation": "Associate Professor",
    "department": "Information Technology",
    "email": "rakesh.sharma@university.edu",
    "orcid": "0000-0001-7373-2645",
    "photo": "initials",
    "hIndex": 14,
    "i10Index": 18,
    "totalCitations": 980,
    "totalPublications": 37,
    "researchAreas": [
      "Cloud Computing",
      "Cybersecurity",
      "IoT"
    ],
    "sources": {
      "googleScholar": {
        "connected": true,
        "citations": 980,
        "hIndex": 14
      },
      "scopus": {
        "connected": true,
        "citations": 905,
        "hIndex": 13
      },
      "orcid": {
        "connected": true,
        "works": 37
      }
    },
    "yearWise": [
      {
        "year": 2021,
        "publications": 4,
        "citations": 90
      },
      {
        "year": 2022,
        "publications": 6,
        "citations": 160
      },
      {
        "year": 2023,
        "publications": 8,
        "citations": 230
      },
      {
        "year": 2024,
        "publications": 10,
        "citations": 290
      },
      {
        "year": 2025,
        "publications": 9,
        "citations": 210
      }
    ]
  },
  {
    "id": "F003",
    "name": "Dr. Priya Nair",
    "designation": "Assistant Professor",
    "department": "Computer Science & Engineering",
    "email": "priya.nair@university.edu",
    "orcid": "0000-0003-4521-9981",
    "photo": "initials",
    "hIndex": 9,
    "i10Index": 8,
    "totalCitations": 410,
    "totalPublications": 22,
    "researchAreas": [
      "Natural Language Processing",
      "AI Ethics"
    ],
    "sources": {
      "googleScholar": {
        "connected": true,
        "citations": 410,
        "hIndex": 9
      },
      "scopus": {
        "connected": false,
        "citations": 0,
        "hIndex": 0
      },
      "orcid": {
        "connected": true,
        "works": 22
      }
    },
    "yearWise": [
      {
        "year": 2021,
        "publications": 2,
        "citations": 20
      },
      {
        "year": 2022,
        "publications": 4,
        "citations": 60
      },
      {
        "year": 2023,
        "publications": 5,
        "citations": 95
      },
      {
        "year": 2024,
        "publications": 6,
        "citations": 130
      },
      {
        "year": 2025,
        "publications": 5,
        "citations": 105
      }
    ]
  },
  {
    "id": "F004",
    "name": "Dr. Vikram Desai",
    "designation": "Professor",
    "department": "Electronics & Communication",
    "email": "vikram.desai@university.edu",
    "orcid": "0000-0002-9034-1123",
    "photo": "initials",
    "hIndex": 27,
    "i10Index": 45,
    "totalCitations": 3120,
    "totalPublications": 76,
    "researchAreas": [
      "VLSI Design",
      "Embedded Systems",
      "Signal Processing"
    ],
    "sources": {
      "googleScholar": {
        "connected": true,
        "citations": 3120,
        "hIndex": 27
      },
      "scopus": {
        "connected": true,
        "citations": 2890,
        "hIndex": 25
      },
      "orcid": {
        "connected": true,
        "works": 76
      }
    },
    "yearWise": [
      {
        "year": 2021,
        "publications": 12,
        "citations": 480
      },
      {
        "year": 2022,
        "publications": 14,
        "citations": 620
      },
      {
        "year": 2023,
        "publications": 15,
        "citations": 710
      },
      {
        "year": 2024,
        "publications": 18,
        "citations": 790
      },
      {
        "year": 2025,
        "publications": 17,
        "citations": 520
      }
    ]
  },
  {
    "id": "F005",
    "name": "Dr. Sneha Kulkarni",
    "designation": "Assistant Professor",
    "department": "Information Technology",
    "email": "sneha.kulkarni@university.edu",
    "orcid": "0000-0001-2468-3579",
    "photo": "initials",
    "hIndex": 7,
    "i10Index": 5,
    "totalCitations": 260,
    "totalPublications": 16,
    "researchAreas": [
      "Data Analytics",
      "Blockchain"
    ],
    "sources": {
      "googleScholar": {
        "connected": true,
        "citations": 260,
        "hIndex": 7
      },
      "scopus": {
        "connected": true,
        "citations": 240,
        "hIndex": 6
      },
      "orcid": {
        "connected": false,
        "works": 0
      }
    },
    "yearWise": [
      {
        "year": 2021,
        "publications": 1,
        "citations": 8
      },
      {
        "year": 2022,
        "publications": 3,
        "citations": 35
      },
      {
        "year": 2023,
        "publications": 4,
        "citations": 60
      },
      {
        "year": 2024,
        "publications": 5,
        "citations": 90
      },
      {
        "year": 2025,
        "publications": 3,
        "citations": 67
      }
    ]
  }
];

const PUBLICATIONS = [
  {
    "id": "P001",
    "facultyId": "F001",
    "title": "Deep Learning Approaches for Real-Time Object Detection in Low-Resource Settings",
    "year": 2025,
    "venue": "IEEE Transactions on Image Processing",
    "type": "Journal",
    "citations": 42,
    "source": "Scopus"
  },
  {
    "id": "P002",
    "facultyId": "F001",
    "title": "A Comparative Study of Transformer Architectures for Vision Tasks",
    "year": 2024,
    "venue": "CVPR Workshop Proceedings",
    "type": "Conference",
    "citations": 61,
    "source": "Google Scholar"
  },
  {
    "id": "P003",
    "facultyId": "F001",
    "title": "Federated Learning for Privacy-Preserving Medical Image Analysis",
    "year": 2024,
    "venue": "Elsevier Artificial Intelligence in Medicine",
    "type": "Journal",
    "citations": 38,
    "source": "Scopus"
  },
  {
    "id": "P004",
    "facultyId": "F001",
    "title": "Clustering Techniques for Large-Scale Genomic Data Mining",
    "year": 2023,
    "venue": "ACM SIGKDD",
    "type": "Conference",
    "citations": 55,
    "source": "Google Scholar"
  },
  {
    "id": "P005",
    "facultyId": "F002",
    "title": "Lightweight Encryption Schemes for IoT Edge Devices",
    "year": 2025,
    "venue": "Journal of Network and Computer Applications",
    "type": "Journal",
    "citations": 19,
    "source": "Scopus"
  },
  {
    "id": "P006",
    "facultyId": "F002",
    "title": "A Survey on Container Security in Multi-Cloud Environments",
    "year": 2024,
    "venue": "IEEE Cloud Computing",
    "type": "Journal",
    "citations": 27,
    "source": "Google Scholar"
  },
  {
    "id": "P007",
    "facultyId": "F002",
    "title": "Intrusion Detection Using Hybrid Machine Learning Models",
    "year": 2023,
    "venue": "International Conference on Cybersecurity",
    "type": "Conference",
    "citations": 33,
    "source": "Scopus"
  },
  {
    "id": "P008",
    "facultyId": "F003",
    "title": "Bias Mitigation Techniques in Large Language Models",
    "year": 2025,
    "venue": "ACL Findings",
    "type": "Conference",
    "citations": 15,
    "source": "Google Scholar"
  },
  {
    "id": "P009",
    "facultyId": "F003",
    "title": "Explainable AI for Ethical Decision Support Systems",
    "year": 2024,
    "venue": "AI & Society Journal",
    "type": "Journal",
    "citations": 22,
    "source": "Google Scholar"
  },
  {
    "id": "P010",
    "facultyId": "F004",
    "title": "Low-Power VLSI Architectures for Edge AI Accelerators",
    "year": 2025,
    "venue": "IEEE Transactions on VLSI Systems",
    "type": "Journal",
    "citations": 29,
    "source": "Scopus"
  },
  {
    "id": "P011",
    "facultyId": "F004",
    "title": "Embedded Signal Processing for Autonomous Navigation",
    "year": 2024,
    "venue": "IEEE Embedded Systems Letters",
    "type": "Journal",
    "citations": 44,
    "source": "Scopus"
  },
  {
    "id": "P012",
    "facultyId": "F004",
    "title": "Design of Fault-Tolerant Digital Circuits Using Redundancy Techniques",
    "year": 2023,
    "venue": "VLSID Conference",
    "type": "Conference",
    "citations": 51,
    "source": "Google Scholar"
  },
  {
    "id": "P013",
    "facultyId": "F005",
    "title": "Blockchain-Based Framework for Academic Credential Verification",
    "year": 2025,
    "venue": "International Journal of Data Analytics",
    "type": "Journal",
    "citations": 12,
    "source": "Google Scholar"
  },
  {
    "id": "P014",
    "facultyId": "F005",
    "title": "Predictive Analytics for Student Performance Using Ensemble Models",
    "year": 2024,
    "venue": "Data Science Conference India",
    "type": "Conference",
    "citations": 18,
    "source": "Scopus"
  }
];
