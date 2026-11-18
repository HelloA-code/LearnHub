"""
Database helpers – SQLite setup, schema, and seed data.
"""

import os
import sqlite3
from flask import g, current_app

DATABASE = os.environ.get("DATABASE_PATH", "learnhub.db")


def get_db():
    """Return a database connection for the current request."""
    if "db" not in g:
        g.db = sqlite3.connect(DATABASE)
        g.db.row_factory = sqlite3.Row
    return g.db


def init_db(db):
    """Create tables if they do not exist."""
    db.executescript("""
        CREATE TABLE IF NOT EXISTS courses (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            title           TEXT NOT NULL,
            short_description TEXT NOT NULL,
            long_description TEXT NOT NULL,
            instructor      TEXT NOT NULL,
            duration        TEXT NOT NULL,
            level           TEXT NOT NULL,
            prerequisites   TEXT DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS enrollments (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            course_id       INTEGER NOT NULL,
            student_name    TEXT NOT NULL,
            email           TEXT NOT NULL,
            enrolled_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (course_id) REFERENCES courses(id)
        );
    """)
    db.commit()


def seed_courses(db):
    """Insert any sample course that is not in the table yet.

    Courses are matched by title, so running this on an existing database adds
    newly introduced courses without duplicating or changing existing rows.
    On an empty database the original six courses keep ids 1-6.
    """
    sample_courses = [
        {
            "title": "Introduction to Cloud Computing",
            "short_description": "Understand the fundamentals of cloud infrastructure, service models (IaaS, PaaS, SaaS), and major providers.",
            "long_description": (
                "This course covers the core concepts behind cloud computing, including "
                "virtualisation, multi-tenancy, and the shared responsibility model. You will "
                "explore the differences between public, private, and hybrid clouds, compare AWS, "
                "Azure, and GCP at a high level, and complete hands-on labs that provision virtual "
                "machines and storage buckets. By the end of the course you should be comfortable "
                "reading cloud architecture diagrams and selecting appropriate service tiers for "
                "small-to-medium workloads."
            ),
            "instructor": "Dr. Meera Krishnan",
            "duration": "6 weeks",
            "level": "Beginner",
            "prerequisites": "Basic understanding of operating systems",
        },
        {
            "title": "DevOps Practices with Jenkins and Docker",
            "short_description": "Learn to build CI/CD pipelines using Jenkins, Docker containers, and automated testing.",
            "long_description": (
                "Starting from version-control basics, this course walks through the full "
                "continuous-integration and continuous-delivery lifecycle. Topics include writing "
                "Jenkinsfiles, building and pushing Docker images, running automated test suites "
                "inside containers, and deploying to staging environments. You will set up a "
                "multi-stage pipeline for a sample web application and learn strategies for "
                "rollback, blue-green deployments, and secret management."
            ),
            "instructor": "Prof. Alan Torres",
            "duration": "8 weeks",
            "level": "Intermediate",
            "prerequisites": "Familiarity with Linux command line and Git",
        },
        {
            "title": "AWS Solutions Architect Preparation",
            "short_description": "A structured review of AWS services, architecture best practices, and exam-style problem solving.",
            "long_description": (
                "Designed for students preparing for the AWS Solutions Architect – Associate "
                "certification, this course reviews compute (EC2, Lambda), storage (S3, EBS), "
                "networking (VPC, Route 53), databases (RDS, DynamoDB), and security (IAM, KMS). "
                "Each module includes scenario-based questions that mirror the exam format. "
                "You will also design a small three-tier web application architecture as your "
                "capstone project."
            ),
            "instructor": "Dr. Meera Krishnan",
            "duration": "10 weeks",
            "level": "Intermediate",
            "prerequisites": "Introduction to Cloud Computing or equivalent experience",
        },
        {
            "title": "Linux System Administration Essentials",
            "short_description": "Gain practical skills in managing Linux servers, user accounts, services, and shell scripting.",
            "long_description": (
                "This hands-on course is built around Ubuntu and CentOS environments. You will "
                "learn to navigate the filesystem, manage packages with apt and yum, configure "
                "SSH and firewalls, write Bash scripts for repetitive tasks, and monitor system "
                "resources. The final project asks you to provision and harden a virtual server "
                "ready for hosting a web application."
            ),
            "instructor": "Ms. Fatima Al-Rashid",
            "duration": "5 weeks",
            "level": "Beginner",
            "prerequisites": "None",
        },
        {
            "title": "Containerisation and Kubernetes",
            "short_description": "Move from single-container Docker workflows to orchestrating multi-container applications with Kubernetes.",
            "long_description": (
                "After a quick Docker refresher, this course focuses on Kubernetes concepts: "
                "pods, deployments, services, config maps, and persistent volumes. You will "
                "deploy a microservices application to a local Minikube cluster, set up "
                "horizontal pod autoscaling, and implement rolling updates. The course also "
                "introduces Helm charts and basic observability with Prometheus and Grafana."
            ),
            "instructor": "Prof. Alan Torres",
            "duration": "8 weeks",
            "level": "Advanced",
            "prerequisites": "DevOps Practices with Jenkins and Docker, or equivalent",
        },
        {
            "title": "Database Design and SQL Fundamentals",
            "short_description": "Learn relational database concepts, write SQL queries, and design normalised schemas.",
            "long_description": (
                "Starting from entity-relationship modelling, this course teaches you to design "
                "normalised database schemas and write SQL for creating tables, inserting data, "
                "and querying with joins, subqueries, and aggregations. You will work with SQLite "
                "and PostgreSQL, learn about indexing and query performance, and complete a "
                "project that models and queries a realistic dataset such as a library catalogue "
                "or student records system."
            ),
            "instructor": "Dr. Ravi Patel",
            "duration": "6 weeks",
            "level": "Beginner",
            "prerequisites": "None",
        },
    ]

    existing = {row[0] for row in db.execute("SELECT title FROM courses").fetchall()}
    for c in sample_courses + ADDITIONAL_COURSES:
        if c["title"] in existing:
            continue
        db.execute(
            "INSERT INTO courses (title, short_description, long_description, "
            "instructor, duration, level, prerequisites) "
            "VALUES (:title, :short_description, :long_description, "
            ":instructor, :duration, :level, :prerequisites)",
            c,
        )
    db.commit()


# Courses added after the first release. Video lessons for every course live in
# static/data/courses.json, matched by title.
ADDITIONAL_COURSES = [
    {
        "title": 'CS50: Introduction to Computer Science',
        "short_description": (
            "Harvard's introduction to computer science: algorithms, C, memory, data "
            'structures, Python, SQL and web programming.'
        ),
        "long_description": (
            "CS50 is Harvard University's introduction to the intellectual "
            'enterprises of computer science and the art of programming. Starting '
            'with Scratch and binary, it moves to C to teach how memory and data '
            'structures really work, then to Python, SQL, and HTML, CSS and '
            'JavaScript, ending with web applications in Flask. Each lecture is split '
            "into lessons by the course's own chapters."
        ),
        "instructor": 'David J. Malan',
        "duration": '11 weeks',
        "level": 'Beginner',
        "prerequisites": 'None',
    },
    {
        "title": 'Python for Everybody',
        "short_description": (
            'A university-level introduction to programming in Python, from variables '
            'and loops to files, web data and databases.'
        ),
        "long_description": (
            "Python for Everybody is Dr. Charles Severance's University of Michigan "
            'course for people with no programming background. It covers variables, '
            'conditionals, functions, loops, strings, files, lists, dictionaries and '
            'tuples, then regular expressions, networked programs, web services, '
            'object-oriented programming and SQLite databases. A second module adds a '
            'project-based Python course from freeCodeCamp.'
        ),
        "instructor": 'Dr. Charles Severance',
        "duration": '8 weeks',
        "level": 'Beginner',
        "prerequisites": 'None',
    },
    {
        "title": 'Git and GitHub in Practice',
        "short_description": (
            'Version control from the first commit to rebasing, cherry-picking and '
            'team workflows on GitHub.'
        ),
        "long_description": (
            'Start with the core Git workflow – staging, committing, branching and '
            'merging – then go further with remotes, pull requests and collaboration '
            'on GitHub. The later modules cover professional techniques: interactive '
            'rebase, cherry-picking, the reflog, submodules, and branching strategies '
            'used by real teams.'
        ),
        "instructor": 'Mosh Hamedani and others',
        "duration": '3 weeks',
        "level": 'Beginner',
        "prerequisites": 'Basic use of a terminal',
    },
    {
        "title": 'Introduction to Algorithms (MIT 6.006)',
        "short_description": (
            'MIT lectures on algorithmic thinking, data structures, sorting and '
            'hashing, with an emphasis on proofs and running time.'
        ),
        "long_description": (
            'Selected lectures from MIT 6.006 (Spring 2020), published by MIT '
            'OpenCourseWare. The course introduces the mathematical modelling of '
            'computational problems and the common algorithms and data structures '
            'used to solve them: models of computation, dynamic arrays, sets and '
            'sorting, hashing and linear-time sorting. The course review lecture ties '
            'the material together, and a 2011 lecture on peak finding adds another '
            'view of algorithmic thinking.'
        ),
        "instructor": 'Erik Demaine, Jason Ku and Justin Solomon',
        "duration": '6 weeks',
        "level": 'Intermediate',
        "prerequisites": 'Programming in Python and basic discrete mathematics',
    },
    {
        "title": 'Data Structures and Algorithms',
        "short_description": (
            'Arrays, linked lists, stacks, queues, heaps, trees, hash tables and '
            'graphs, with the algorithms that use them.'
        ),
        "long_description": (
            'A practical course on the data structures every programmer should know. '
            'You will implement and analyse dynamic arrays, linked lists, stacks, '
            'queues, priority queues and heaps, union-find, binary search trees, hash '
            'tables, Fenwick trees, suffix arrays and balanced trees. A second module '
            'introduces algorithmic thinking, sorting and searching for beginners.'
        ),
        "instructor": 'William Fiset and others',
        "duration": '8 weeks',
        "level": 'Intermediate',
        "prerequisites": 'Comfortable with one programming language',
    },
    {
        "title": 'Web Development Foundations: HTML, CSS and JavaScript',
        "short_description": (
            'Build web pages from scratch: semantic HTML, CSS layout with flexbox and '
            'grid, and JavaScript for interactivity.'
        ),
        "long_description": (
            'This course builds the three languages of the web in order. You start '
            'with semantic HTML5 – headings, links, images, lists, tables and forms – '
            'then style pages with CSS: selectors, the box model, typography, '
            'flexbox, grid and responsive design. The final module teaches JavaScript '
            'from variables and functions to objects, arrays and loops, so you can '
            'add behaviour to your pages.'
        ),
        "instructor": 'freeCodeCamp.org instructors',
        "duration": '8 weeks',
        "level": 'Beginner',
        "prerequisites": 'None',
    },
    {
        "title": 'Computer Networking Fundamentals',
        "short_description": (
            'How networks work: the OSI and TCP/IP models, IP addressing and '
            'subnetting, routing, switching, DNS and common protocols.'
        ),
        "long_description": (
            'Begin with what a network is, then go layer by layer through the OSI '
            'model with real-life examples. The last module follows a full Network+ '
            'exam preparation course: cabling and topologies, IP addressing and '
            'subnetting, routing and switching, wireless, network services such as '
            'DNS and DHCP, security and troubleshooting.'
        ),
        "instructor": 'Multiple instructors',
        "duration": '6 weeks',
        "level": 'Beginner',
        "prerequisites": 'None',
    },
    {
        "title": 'Cybersecurity Fundamentals',
        "short_description": (
            'Core security concepts – threats, passwords and hashing, malware, email '
            'and network attacks – then an introduction to ethical hacking.'
        ),
        "long_description": (
            'The first module explains the terminology of security, how computers and '
            'the internet work, passwords and hash functions, common password '
            'attacks, how email works and the main types of malware. The second '
            'module is a long introduction to network penetration testing by Heath '
            "Adams: the ethical hacker's methodology, networking refreshers, Linux, "
            'Python, information gathering, scanning and exploitation in a lab.'
        ),
        "instructor": 'Multiple instructors',
        "duration": '6 weeks',
        "level": 'Beginner',
        "prerequisites": 'Basic networking and command-line use',
    },
    {
        "title": 'Infrastructure as Code with Terraform',
        "short_description": (
            'Define cloud infrastructure in code with Terraform: providers, state, '
            'variables, modules and multi-environment setups, plus an intro to '
            'Ansible.'
        ),
        "long_description": (
            'Learn why infrastructure as code matters, then build up Terraform '
            'skills: the HCL language, providers and resources, state and remote '
            'backends, variables and outputs, modules, and managing several '
            'environments. You will automate AWS infrastructure end to end, and '
            'finish with a short look at Ansible for configuring the servers you '
            'create.'
        ),
        "instructor": 'Sid Palas and others',
        "duration": '5 weeks',
        "level": 'Intermediate',
        "prerequisites": 'Basic AWS knowledge and command-line use',
    },
    {
        "title": 'Machine Learning Foundations',
        "short_description": (
            'Supervised and unsupervised learning in Python: regression, '
            'classification, neural networks, clustering and model evaluation.'
        ),
        "long_description": (
            'A practical introduction to machine learning with Python. You will learn '
            'the vocabulary of features, labels and training sets, then work through '
            'k-nearest neighbours, naive Bayes, logistic regression, support vector '
            'machines, neural networks, linear regression, k-means clustering and '
            'principal component analysis. A second module covers the same ground '
            'more slowly, with more on data preparation and evaluation.'
        ),
        "instructor": 'Kylie Ying and others',
        "duration": '6 weeks',
        "level": 'Intermediate',
        "prerequisites": 'Python and high-school algebra',
    },
    {
        "title": 'Linear Algebra (MIT 18.06)',
        "short_description": (
            "The opening lectures of Gilbert Strang's linear algebra course: the "
            'geometry of linear equations, elimination, and matrix multiplication and '
            'inverses.'
        ),
        "long_description": (
            "Professor Gilbert Strang's MIT 18.06 is one of the most watched "
            'mathematics courses in the world. These first three lectures look at '
            'systems of linear equations from the row and column pictures, solve them '
            'by elimination with matrices, and develop matrix multiplication and '
            'inverses. They are the foundation for the rest of linear algebra and for '
            'machine learning.'
        ),
        "instructor": 'Prof. Gilbert Strang',
        "duration": '3 weeks',
        "level": 'Intermediate',
        "prerequisites": 'High-school algebra',
    },
    {
        "title": 'Building Web Apps with Flask',
        "short_description": (
            'Build Python web applications with Flask: routing, Jinja templates, '
            'forms, databases, authentication and deployment.'
        ),
        "long_description": (
            'Flask is the framework this platform is built on. This course starts '
            'with routes, templates and static files, then adds forms and validation, '
            'a database with SQLAlchemy, user registration and login, and finally '
            "deployment. CS50's Flask lecture is included as a compact overview of "
            'the same ideas.'
        ),
        "instructor": 'freeCodeCamp.org instructors',
        "duration": '4 weeks',
        "level": 'Intermediate',
        "prerequisites": 'Python basics and some HTML',
    },
    {
        "title": 'Google Cloud Associate Cloud Engineer',
        "short_description": (
            'Prepare for the Associate Cloud Engineer exam: projects and IAM, Compute '
            'Engine, GKE, App Engine, Cloud Run, storage, networking and operations.'
        ),
        "long_description": (
            'A full course for the Google Cloud Associate Cloud Engineer '
            'certification. It covers the resource hierarchy, billing and IAM, the '
            'compute options from Compute Engine to GKE, App Engine, Cloud Run and '
            'Cloud Functions, storage and databases, VPC networking, load balancing, '
            'and monitoring and logging, with hands-on follow-alongs throughout.'
        ),
        "instructor": 'freeCodeCamp.org instructors',
        "duration": '8 weeks',
        "level": 'Intermediate',
        "prerequisites": 'Introduction to Cloud Computing or equivalent experience',
    },
    {
        "title": 'System Design Fundamentals',
        "short_description": (
            'The building blocks of large systems: scaling, load balancing, caching, '
            'databases, CAP and how to approach design interviews.'
        ),
        "long_description": (
            'An introduction to system design concepts and interview preparation. It '
            'covers vertical and horizontal scaling, load balancers, caching and '
            'CDNs, database choices and replication, the CAP theorem, and a method '
            'for working through design questions.'
        ),
        "instructor": 'freeCodeCamp.org instructors',
        "duration": '2 weeks',
        "level": 'Intermediate',
        "prerequisites": 'Experience building a web application',
    },
]
