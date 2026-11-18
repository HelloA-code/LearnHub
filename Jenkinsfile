// LearnHub CI/CD pipeline (Jenkins on Windows).
//
//   CI: install -> unit tests -> build image -> smoke-test the container
//   CD: push to Docker Hub -> deploy to AWS EC2 over SSH -> verify the live site
//
// Jenkins credentials used (Manage Jenkins > Credentials), see docs/DEPLOYMENT.md:
//   dockerhub-creds  Username with password  Docker Hub username + access token
//   ec2-ssh-key      SSH Username with private key  user "ubuntu" + the EC2 key pair (.pem)
//   ec2-host         Secret text  the EC2 public IP or DNS name

// True when the EC2 credentials exist, so builds before the AWS setup still pass CI.
def ec2Configured() {
    try {
        withCredentials([string(credentialsId: 'ec2-host', variable: 'EC2_HOST_CHECK')]) { }
        return true
    } catch (err) {
        return false
    }
}

pipeline {
    agent any

    parameters {
        booleanParam(name: 'DEPLOY_TO_EC2', defaultValue: true,
                     description: 'Deploy the pushed image to the EC2 instance after a successful build.')
    }

    options {
        buildDiscarder(logRotator(numToKeepStr: '20'))
        disableConcurrentBuilds()
    }

    triggers {
        // Check GitHub for new commits every ~5 minutes (works without a public webhook URL).
        pollSCM('H/5 * * * *')
    }

    environment {
        IMAGE_NAME     = 'online-education-platform'
        DOCKERHUB_REPO = 'akhilhegde0118/online-education-platform'
        SMOKE_PORT     = '5055'
        SMOKE_NAME     = 'learnhub-smoke'
    }

    stages {
        stage('Check Tools') {
            steps {
                bat 'python --version'
                bat 'docker --version'
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
                bat 'python -m pytest tests/ -v --junitxml=reports\\junit.xml'
            }
            post {
                always {
                    junit allowEmptyResults: true, testResults: 'reports/junit.xml'
                }
            }
        }

        stage('Build Docker Image') {
            steps {
                bat 'docker build -t %IMAGE_NAME%:%BUILD_NUMBER% -t %IMAGE_NAME%:latest .'
            }
        }

        stage('Smoke Test Container') {
            steps {
                bat 'docker rm -f %SMOKE_NAME% >nul 2>&1 & exit /b 0'
                bat 'docker run -d --name %SMOKE_NAME% -p %SMOKE_PORT%:5000 %IMAGE_NAME%:%BUILD_NUMBER%'
                powershell '''
                    $base = "http://localhost:$env:SMOKE_PORT"
                    $ready = $false
                    for ($i = 0; $i -lt 20; $i++) {
                        try {
                            $r = Invoke-WebRequest -UseBasicParsing "$base/health" -TimeoutSec 3
                            if ($r.StatusCode -eq 200) { $ready = $true; break }
                        } catch { }
                        Start-Sleep -Seconds 2
                    }
                    if (-not $ready) {
                        docker logs $env:SMOKE_NAME
                        throw "Container did not become healthy at $base/health"
                    }
                    foreach ($path in '/', '/course/1', '/enroll/1', '/my-enrollments', '/static/data/courses.json') {
                        $r = Invoke-WebRequest -UseBasicParsing "$base$path" -TimeoutSec 10
                        if ($r.StatusCode -ne 200) { throw "GET $path returned $($r.StatusCode)" }
                        Write-Output "OK  GET $path"
                    }
                '''
            }
            post {
                always {
                    bat 'docker rm -f %SMOKE_NAME% >nul 2>&1 & exit /b 0'
                }
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

        stage('Deploy to EC2') {
            when {
                allOf {
                    expression { return params.DEPLOY_TO_EC2 }
                    // Multibranch jobs: deploy main only. Single-branch jobs have no BRANCH_NAME.
                    anyOf { branch 'main'; expression { return env.BRANCH_NAME == null } }
                }
            }
            steps {
                script {
                    if (!ec2Configured()) {
                        unstable('EC2 is not set up yet (no "ec2-host" / "ec2-ssh-key" credentials), so the deploy was skipped. See docs/DEPLOYMENT.md.')
                        env.DEPLOY_SKIPPED = 'true'
                        return
                    }
                    withCredentials([
                        sshUserPrivateKey(credentialsId: 'ec2-ssh-key', keyFileVariable: 'SSH_KEY', usernameVariable: 'SSH_USER'),
                        string(credentialsId: 'ec2-host', variable: 'EC2_HOST')
                    ]) {
                        bat '''
                            @echo off
                            rem Windows OpenSSH refuses keys that other accounts can read: restrict it to this account.
                            for /f "delims=" %%u in ('whoami') do icacls "%SSH_KEY%" /inheritance:r /grant:r "%%u:R" >nul || exit /b 1
                            set SSH_OPTS=-i "%SSH_KEY%" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20
                            scp %SSH_OPTS% deploy\\deploy.sh %SSH_USER%@%EC2_HOST%:/tmp/learnhub-deploy.sh || exit /b 1
                            ssh %SSH_OPTS% %SSH_USER%@%EC2_HOST% "bash /tmp/learnhub-deploy.sh %DOCKERHUB_REPO%:%BUILD_NUMBER%" || exit /b 1
                        '''
                    }
                }
            }
        }

        stage('Verify Deployment') {
            when {
                allOf {
                    expression { return params.DEPLOY_TO_EC2 && env.DEPLOY_SKIPPED != 'true' }
                    anyOf { branch 'main'; expression { return env.BRANCH_NAME == null } }
                }
            }
            steps {
                withCredentials([string(credentialsId: 'ec2-host', variable: 'EC2_HOST')]) {
                    powershell '''
                        $base = "http://$env:EC2_HOST"
                        foreach ($path in '/health', '/', '/course/1') {
                            $ok = $false
                            for ($i = 0; $i -lt 10; $i++) {
                                try {
                                    $r = Invoke-WebRequest -UseBasicParsing "$base$path" -TimeoutSec 10
                                    if ($r.StatusCode -eq 200) { $ok = $true; break }
                                } catch { }
                                Start-Sleep -Seconds 3
                            }
                            if (-not $ok) { throw "Live site check failed: GET $path" }
                            Write-Output "OK  live GET $path"
                        }
                    '''
                }
            }
        }
    }

    post {
        always {
            // Remove dangling layers left by rebuilding :latest.
            bat 'docker image prune -f >nul 2>&1 & exit /b 0'
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
