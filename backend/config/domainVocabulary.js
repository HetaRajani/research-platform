/**
 * Configurable Domain Vocabulary for Research Platform (Phase 12B)
 * 
 * Provides domain definitions, canonical names, descriptions, aliases,
 * multi-word phrases, distinctive domain keywords, and acronyms for
 * rule-based, explainable research domain classification.
 * 
 * Designed to be modular, transparent, and easy to extend or tune.
 */

const DOMAIN_VOCABULARY = Object.freeze([
  {
    name: 'Artificial Intelligence',
    description: 'Foundational artificial intelligence, knowledge representation, automated reasoning, and heuristic systems',
    aliases: ['AI', 'Computational Intelligence', 'Intelligent Systems'],
    phrases: [
      'artificial intelligence',
      'intelligent agent',
      'intelligent agents',
      'expert system',
      'expert systems',
      'knowledge representation',
      'symbolic reasoning',
      'automated reasoning',
      'cognitive computing',
      'knowledge graph',
      'knowledge graphs',
      'heuristic search',
      'computational intelligence',
      'ai ethics',
      'explainable ai',
      'neuro-symbolic'
    ],
    keywords: [
      'heuristics',
      'ontology',
      'ontologies'
    ],
    acronyms: ['ai', 'xai']
  },
  {
    name: 'Machine Learning',
    description: 'Statistical machine learning, deep neural networks, and algorithmic training frameworks',
    aliases: ['ML', 'Deep Learning', 'Statistical Learning'],
    phrases: [
      'machine learning',
      'deep learning',
      'neural network',
      'neural networks',
      'supervised learning',
      'unsupervised learning',
      'reinforcement learning',
      'transfer learning',
      'federated learning',
      'random forest',
      'support vector machine',
      'gradient boosting',
      'deep neural network',
      'deep neural networks',
      'convolutional neural',
      'recurrent neural',
      'hyperparameter optimization',
      'loss function',
      'semi-supervised',
      'self-supervised',
      'representation learning'
    ],
    keywords: [
      'transformer',
      'transformers',
      'xgboost',
      'backpropagation',
      'overfitting',
      'autoencoder',
      'autoencoders'
    ],
    acronyms: ['ml', 'svm', 'cnn', 'rnn', 'lstm', 'gan', 'gans', 'dnn']
  },
  {
    name: 'Data Science',
    description: 'Data analytics, statistical modeling, data mining, and predictive intelligence',
    aliases: ['Data Analytics', 'Big Data Science', 'Data Mining'],
    phrases: [
      'data science',
      'data analytics',
      'data mining',
      'predictive analytics',
      'predictive modeling',
      'exploratory data analysis',
      'feature engineering',
      'feature selection',
      'statistical analysis',
      'statistical modeling',
      'time series analysis',
      'time series forecasting',
      'cluster analysis',
      'business intelligence',
      'data visualization',
      'anomaly detection',
      'multivariate analysis'
    ],
    keywords: [
      'clustering',
      'preprocessing'
    ],
    acronyms: ['eda', 'bi']
  },
  {
    name: 'Internet of Things',
    description: 'Connected smart devices, sensor networks, edge intelligence, and ubiquitous computing',
    aliases: ['IoT', 'Connected Devices', 'Smart Systems', 'Sensor Networks'],
    phrases: [
      'internet of things',
      'smart city',
      'smart cities',
      'smart home',
      'smart homes',
      'sensor network',
      'sensor networks',
      'wireless sensor network',
      'wireless sensor networks',
      'connected device',
      'connected devices',
      'industrial iot',
      'wearable device',
      'wearable devices',
      'edge device',
      'edge devices',
      'smart sensor',
      'smart sensors',
      'actuator network',
      'ambient intelligence'
    ],
    keywords: [
      'actuator',
      'actuators',
      'telemetry',
      'rfid',
      'zigbee',
      'lora',
      'lorawan'
    ],
    acronyms: ['iot', 'iiot', 'wsn', 'm2m']
  },
  {
    name: 'Cybersecurity',
    description: 'Information security, network defense, threat intelligence, cryptography, and privacy',
    aliases: ['Cyber Security', 'InfoSec', 'Information Security', 'Network Security'],
    phrases: [
      'cyber security',
      'cybersecurity',
      'information security',
      'network security',
      'intrusion detection',
      'intrusion prevention',
      'malware detection',
      'malware analysis',
      'zero trust',
      'access control',
      'penetration testing',
      'threat intelligence',
      'public key cryptography',
      'denial of service',
      'distributed denial of service',
      'vulnerability assessment',
      'secure protocol',
      'cyber attack',
      'cyber attacks'
    ],
    keywords: [
      'cryptography',
      'encryption',
      'decryption',
      'ransomware',
      'phishing',
      'firewall',
      'vulnerability',
      'vulnerabilities',
      'exploit',
      'botnet'
    ],
    acronyms: ['ids', 'ips', 'ddos', 'pki', 'soc']
  },
  {
    name: 'Computer Networks',
    description: 'Network protocols, routing architectures, wireless communication, and telecom infrastructure',
    aliases: ['Networking', 'Telecommunications', 'Data Communication'],
    phrases: [
      'computer network',
      'computer networks',
      'software defined network',
      'software defined networking',
      'software-defined networking',
      'routing protocol',
      'routing protocols',
      'wireless network',
      'wireless networks',
      'packet forwarding',
      'network topology',
      'network performance',
      'quality of service',
      'congestion control',
      'traffic engineering',
      'mesh network',
      'mesh networks',
      'cellular network',
      'cellular networks',
      'ad hoc network',
      'optical network',
      'tcp/ip'
    ],
    keywords: [
      'telecommunication',
      'telecommunications'
    ],
    acronyms: ['sdn', 'qos', 'tcp', 'udp', 'lan', 'wan', 'wlan', '5g', '6g', 'nfv']
  },
  {
    name: 'Cloud Computing',
    description: 'Virtualization, distributed server architectures, serverless, and cloud native technologies',
    aliases: ['Cloud Native', 'Cloud Infrastructure', 'Serverless'],
    phrases: [
      'cloud computing',
      'cloud infrastructure',
      'cloud storage',
      'cloud native',
      'edge computing',
      'fog computing',
      'serverless computing',
      'virtual machine',
      'virtual machines',
      'resource allocation',
      'load balancing',
      'cloud platform',
      'data center',
      'data centers',
      'multi-cloud',
      'hybrid cloud',
      'container orchestration'
    ],
    keywords: [
      'virtualization',
      'kubernetes',
      'docker',
      'microservices',
      'serverless',
      'multitenancy'
    ],
    acronyms: ['iaas', 'paas', 'saas']
  },
  {
    name: 'Blockchain',
    description: 'Decentralized ledgers, consensus algorithms, cryptocurrencies, and smart contracts',
    aliases: ['Distributed Ledger Technology', 'DLT', 'Web3', 'Crypto'],
    phrases: [
      'smart contract',
      'smart contracts',
      'distributed ledger',
      'distributed ledgers',
      'consensus mechanism',
      'consensus mechanisms',
      'proof of work',
      'proof of stake',
      'decentralized application',
      'decentralized applications',
      'decentralized finance',
      'permissioned blockchain',
      'permissionless blockchain',
      'byzantine fault tolerance',
      'ledger technology'
    ],
    keywords: [
      'blockchain',
      'blockchains',
      'cryptocurrency',
      'cryptocurrencies',
      'bitcoin',
      'ethereum',
      'hyperledger',
      'tokenization'
    ],
    acronyms: ['dapp', 'dapps', 'defi', 'nft', 'pbft']
  },
  {
    name: 'Computer Vision',
    description: 'Visual scene understanding, image processing, object detection, and visual recognition',
    aliases: ['CV', 'Visual Computing', 'Image Processing'],
    phrases: [
      'computer vision',
      'image processing',
      'object detection',
      'image segmentation',
      'semantic segmentation',
      'instance segmentation',
      'image classification',
      'face recognition',
      'facial recognition',
      'pattern recognition',
      'feature extraction',
      'optical character recognition',
      'visual tracking',
      'pose estimation',
      'scene understanding',
      'medical image analysis',
      'medical imaging',
      '3d reconstruction'
    ],
    keywords: [
      'yolo',
      'resnet',
      'photogrammetry'
    ],
    acronyms: ['cv', 'ocr']
  },
  {
    name: 'Natural Language Processing',
    description: 'Computational linguistics, text analytics, language models, and conversational agents',
    aliases: ['NLP', 'Computational Linguistics', 'Language Technologies'],
    phrases: [
      'natural language processing',
      'natural language understanding',
      'natural language generation',
      'computational linguistics',
      'text mining',
      'sentiment analysis',
      'large language model',
      'large language models',
      'machine translation',
      'speech recognition',
      'named entity recognition',
      'text classification',
      'information extraction',
      'question answering',
      'dialogue system',
      'dialogue systems',
      'topic modeling',
      'word embedding',
      'word embeddings'
    ],
    keywords: [
      'lemmatization',
      'corpus',
      'corpora',
      'bert',
      'gpt'
    ],
    acronyms: ['nlp', 'nlu', 'nlg', 'llm', 'llms', 'ner']
  },
  {
    name: 'Software Engineering',
    description: 'Software development methodologies, architecture, automated testing, and code quality',
    aliases: ['SE', 'Software Development', 'Software Systems'],
    phrases: [
      'software engineering',
      'software architecture',
      'software development',
      'software testing',
      'test automation',
      'code quality',
      'static analysis',
      'dynamic analysis',
      'refactoring',
      'software maintenance',
      'design pattern',
      'design patterns',
      'continuous integration',
      'continuous delivery',
      'agile methodology',
      'agile development',
      'empirical software engineering',
      'fault localization',
      'software metrics'
    ],
    keywords: [
      'devops',
      'modularization',
      'traceability'
    ],
    acronyms: ['ci/cd', 'tdd']
  },
  {
    name: 'Embedded Systems',
    description: 'Real-time microarchitectures, microcontrollers, FPGA development, and hardware-software co-design',
    aliases: ['Embedded Architecture', 'Real-Time Systems', 'Hardware Systems'],
    phrases: [
      'embedded system',
      'embedded systems',
      'real-time system',
      'real-time systems',
      'real-time operating system',
      'system on chip',
      'systems on chip',
      'hardware software co-design',
      'low power design',
      'low power architecture',
      'device driver',
      'device drivers',
      'hardware acceleration'
    ],
    keywords: [
      'microcontroller',
      'microcontrollers',
      'microprocessor',
      'firmware',
      'fpga',
      'verilog',
      'vhdl',
      'arduino'
    ],
    acronyms: ['rtos', 'soc', 'vlsi', 'asic']
  },
  {
    name: 'Robotics',
    description: 'Robotic mechanics, autonomous navigation, kinematics, manipulation, and control theory',
    aliases: ['Robotic Systems', 'Autonomous Robotics', 'Mechatronics'],
    phrases: [
      'autonomous robot',
      'autonomous robots',
      'mobile robot',
      'mobile robots',
      'robotic arm',
      'robotic arms',
      'humanoid robot',
      'humanoid robots',
      'manipulation planning',
      'motion planning',
      'trajectory planning',
      'path planning',
      'simultaneous localization and mapping',
      'unmanned aerial vehicle',
      'unmanned aerial vehicles',
      'inverse kinematics',
      'forward kinematics',
      'robot control',
      'multi-robot systems'
    ],
    keywords: [
      'robotics',
      'robot',
      'robots',
      'kinematics',
      'manipulator',
      'actuation',
      'drone',
      'drones'
    ],
    acronyms: ['slam', 'uav', 'uavs', 'ros']
  },
  {
    name: 'Big Data',
    description: 'Massive scale data processing, distributed storage engines, streaming architectures, and data lakes',
    aliases: ['Big Data Engineering', 'Massive Scale Analytics', 'Data Engineering'],
    phrases: [
      'big data',
      'large scale data',
      'large-scale data',
      'massive dataset',
      'massive datasets',
      'stream processing',
      'batch processing',
      'data pipeline',
      'data pipelines',
      'data warehousing',
      'data lake',
      'data lakes',
      'distributed processing'
    ],
    keywords: [
      'hadoop',
      'mapreduce',
      'spark',
      'kafka',
      'nosql',
      'petabyte',
      'terabyte',
      'cassandra'
    ],
    acronyms: ['etl', 'olap', 'hdfs']
  },
  {
    name: 'Human Computer Interaction',
    description: 'User experience research, interaction design, accessibility, and multimodal interfaces',
    aliases: ['HCI', 'User Experience', 'UX Research', 'Interaction Design'],
    phrases: [
      'human computer interaction',
      'human-computer interaction',
      'user experience',
      'user interface',
      'user-centered design',
      'user centered design',
      'interaction design',
      'virtual reality',
      'augmented reality',
      'mixed reality',
      'gesture recognition',
      'eye tracking',
      'conversational interface',
      'assistive technology',
      'assistive technologies',
      'usability study',
      'usability evaluation'
    ],
    keywords: [
      'usability',
      'accessibility',
      'ergonomics'
    ],
    acronyms: ['hci', 'ux', 'ui', 'vr', 'ar', 'mr']
  }
]);

/**
 * Find a domain configuration by name or alias
 * @param {string} searchName 
 * @param {Array} vocabulary 
 * @returns {object|null}
 */
const getDomainByName = (searchName, vocabulary = DOMAIN_VOCABULARY) => {
  if (!searchName || typeof searchName !== 'string') return null;
  const target = searchName.trim().toLowerCase();
  for (const domain of vocabulary) {
    if (domain.name.toLowerCase() === target) return domain;
    if (Array.isArray(domain.aliases)) {
      if (domain.aliases.some(alias => alias.toLowerCase() === target)) {
        return domain;
      }
    }
  }
  return null;
};

/**
 * Return a copy of all domains in the vocabulary
 * @param {Array} vocabulary 
 * @returns {Array}
 */
const getAllDomains = (vocabulary = DOMAIN_VOCABULARY) => {
  return [...vocabulary];
};

module.exports = {
  DOMAIN_VOCABULARY,
  getDomainByName,
  getAllDomains
};
