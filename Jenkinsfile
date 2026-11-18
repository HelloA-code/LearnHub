pipeline {
    agent any

    environment {
        IMAGE_NAME = 'online-education-platform'
        DOCKERHUB_REPO = 'akhilhegde0118/online-education-platform'
    }

    stages {
        stage('Check Python') {
            steps {
                bat 'python --version'
            }
        }

        stage('Install Dependencies') {
            steps {
                bat 'python -m pip install --upgrade pip'
                bat 'pip install -r requirements.txt'
                bat 'pip install -r requirements-dev.txt'
            }
        }

        stage('Run Tests') {
            steps {
                bat 'python -m pytest tests/ -v'
            }
        }

        stage('Check Docker') {
            steps {
                bat 'docker --version'
            }
        }

        stage('Build Docker Image') {
            steps {
                bat "docker build -t %IMAGE_NAME%:%BUILD_NUMBER% ."
                bat "docker build -t %IMAGE_NAME%:latest ."
            }
        }

        stage('Push to Docker Hub') {
            steps {
                withCredentials([usernamePassword(
                    credentialsId: 'dockerhub-creds',
                    usernameVariable: 'DOCKERHUB_USER',
                    passwordVariable: 'DOCKERHUB_TOKEN'
                )]) {
                    bat '''
                        @echo off
                        echo %DOCKERHUB_TOKEN%| docker login --username %DOCKERHUB_USER% --password-stdin || exit /b 1
                        docker tag %IMAGE_NAME%:latest %DOCKERHUB_REPO%:latest || exit /b 1
                        docker tag %IMAGE_NAME%:%BUILD_NUMBER% %DOCKERHUB_REPO%:%BUILD_NUMBER% || exit /b 1
                        docker push %DOCKERHUB_REPO%:latest || exit /b 1
                        docker push %DOCKERHUB_REPO%:%BUILD_NUMBER% || exit /b 1
                        docker logout
                    '''
                }
            }
        }
    }

    post {
        always {
            echo "Pipeline finished - Build #${env.BUILD_NUMBER}"
        }
        success {
            echo 'All stages passed.'
        }
        failure {
            echo 'Pipeline failed. Check the stage logs above.'
        }
    }
}
