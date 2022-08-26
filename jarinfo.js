// MULTI-CORE J2ME JAR HASHER + INFO EXTRACTOR | EXCLUDES EVERYTHING INSIDE MANIFEST FOLDER TO IGNORE MANIFEST-ONLY-CHANGES | (c) Remixer Dec 2020 | License: CC BY-NC 4.0
// использование: node jarhasher.js "C:/path/to/folder_with_jar_files_only_with_forward_slashes" CPU_LOGICAL_CORES OUTPUT_FILENAME ADD_SIMVEC ADD_ICONS
// установка: npm i jszip
// вывод в файл: [{"file":"имя_jar_файла","status":"статус распаковки, может быть success или fail","m-name":"midlet-имя","m-desc":"midlet-описание","m-vendor":"midlet-поставщик","m-icon":"иконка в base64","simvec":"вектор похожести (список crc32 внутри jar)","md5":"стандартный md5-хэш файла", "jsha":"очищенный от модификаций sha-1 хэш от crc32-сумм локально отсортированных файлов внутри jar-архива"},..]
//file и status выдаются всегда, если status равен success, также гарантируются хэши, остальное зависит от манифеста.

//импорт системных модулей
const os = require('os')
const fs = require('fs')
const crypto = require('crypto')
const cluster = require('cluster')
const path = require('path')
const JSZip = require('jszip')

// когфигурация
//папка с JAR-файлами
const DIR = process.argv[2] || 'C:/J2ME/SomeSite/'
//количество процессов для использования (рек. 1 на 1 физическое ядро)
const THREADS = process.argv[3] || os.cpus().length / 2
//имя выходного файла с результатами
const OUTPUT_FILENAME = process.argv[4] || 'processed_output.json'
//нужно ли добавлять вектор похожести (список crc32 для файлов внутри JAR)
const ADD_SIMVEC = process.argv[5] || true
//нужно ли извлекать и добавлять иконки
const ADD_ICONS = process.argv[6] || true

function processFile(fn) {
    return new Promise((rs, rj) => {
        output = {"file": fn}
        //открыть jar
        fs.readFile(path.posix.join(DIR, fn), (err, f) => {

            let md5 = crypto.createHash("md5");
            md5.update(f)

            JSZip.loadAsync(f).then(async function (zip) {
                let files = Object.values(zip.files).sort((a,b) => a.name.localeCompare(b.name))
                let filenames = Object.keys(zip.files)
                let jsha = crypto.createHash("sha1");

                output.status = 'success'
                if (ADD_SIMVEC) output.simvec = []
                //пройтись по файлам внутри JAR
                for(let i=0, l=files.length; i<l; i++){
                    if (files[i].name.slice(0,8).toLowerCase() != 'meta-inf') {
                        let b = Buffer.alloc(4)
                        b.writeInt32LE(files[i]._data.crc32)
                        jsha.update(b)
                        if (files[i].dir === false && ADD_SIMVEC) output.simvec.push(files[i]._data.crc32)
                    } else if (files[i].name.toLowerCase() == 'meta-inf/manifest.mf'){
                        let manifest = await files[i].async('text')
						let mmversion = manifest.match(/manifest-version:(.+)/im)
                        let mname = manifest.match(/midlet-name:(.+)/im) || manifest.match(/midlet-1:([^,]+)/im)
						let mconfiguration = manifest.match(/microedition-configuration:(.+)/im)
                        let mvendor = manifest.match(/midlet-vendor:(.+)/im)
						let mversion = manifest.match(/midlet-version:(.+)/im)
						let mprofile = manifest.match(/microedition-profile:(.+)/im)
                        let mdesc = manifest.match(/midlet-description:(.+)/im)
						let minfo = manifest.match(/midlet-info-url:(.+)/im)
						let mdatasize = manifest.match(/midlet-data-size:(.+)/im)
                        let micon = manifest.match(/midlet-icon:(.+)/im) || manifest.match(/,([^,]+\.png)/im) || ('icon.png' in zip.files ? [true, 'icon.png'] : false)
                        micon = micon ? micon[1].replace(/^[\s\.\\\/]+/img,'').trim() : micon

						if (mmversion) output['m-mversion'] = mmversion[1].trim()
                        if (mname) output['m-name'] = mname[1].trim()
						if (mconfiguration) output['m-config'] = mconfiguration[1].trim()
                        if (ADD_ICONS && micon && (micon in zip.files || filenames.find(f => f.toLowerCase() == micon.toLowerCase() || f == 'icon.png'))) {
                            output['m-icon'] = await (zip.files[micon] || zip.files['icon.png'] || zip.files[filenames.find(f => f.toLowerCase() == micon.toLowerCase())]).async('base64')
                        }
                        if (mvendor) output['m-vendor'] = mvendor[1].trim()
						if (mversion) output['m-version'] = mversion[1].trim()
						if (mprofile) output['m-profile'] = mprofile[1].trim()
                        if (mdesc) output['m-desc'] = mdesc[1].trim()
						if (minfo) output['m-info'] = minfo[1].trim()
						if (mdatasize) output['m-datasize'] = mdatasize[1].trim()
                    }
                }

                output.md5 = md5.digest().toString('hex')
                output.jsha = jsha.digest().toString('hex')

                rs(output)

            }).catch(e => {
                if (!e.toString().match(/corrupted/im)) console.log(e);
                corrupted.push(fn)
                output.status = 'fail'
                rs(output)
            });
        })
    })
}

function arrSplit(arr, chunkSize){
    return new Array(Math.ceil(arr.length / chunkSize)).fill().map(_ => arr.splice(0, chunkSize))
}

const progress = []
let allData = []
let corrupted = []
let jobsDone = 0

if (cluster.isMaster) {
    //если это главный процесс
    let t1 = Date.now()
    //из всех файлов в папке выбрать только JAR
    let fl = fs.readdirSync(DIR).filter(x=>x.toLowerCase().endsWith('jar'))
    //разделить список файлов на равные по величине массивы
    let arrs = arrSplit(fl, Math.ceil(fl.length/THREADS))

    for(let y=0; y<THREADS; y++){
        //для каждого ядра создать новый процесс
        let fr = cluster.fork()
        progress.push(0)
        //создать прогрессбар выполнения

        //при получении сообщения от процесса
        fr.on('message', (msg) => {
            //если есть статус прогресса
            if ('progress' in msg) {
                //обновить название главного окна
                progress[msg.id-1] = msg.progress
                process.title = 'Hashing: ' + progress.map(x => x+'%').join(' | ')
                return
                //и выйти
            }
            //в противном случае, сообщение гласит о завершении работы процесса
            console.log(`Процесс #${msg.id} завершил работу!`)
            //нужно в массив вывода добавить данные этого процесса
            allData = [].concat(allData, msg.data)
            //в массив поврежденных добавить данные о них
            corrupted = [].concat(corrupted, msg.corrupted)

            jobsDone++
            //если все процессы завершили свою работу
            if(jobsDone == THREADS){
                let t2 = Date.now()
                console.log(`Завершено за ${(t2-t1)} мс, обработано ${allData.length} файлов, из них ${corrupted.length} оказались повреждены`);
                fs.writeFileSync(OUTPUT_FILENAME, JSON.stringify(allData))
                //fs.writeFileSync('corrupted.json', JSON.stringify(corrupted))
                process.exit()
            }
        })

        //послать процессу список его файлов
        fr.send({files:arrs[y]});
    }
} else {
    //если это не главный процесс
    //при получении сообщения с заданием
    process.on('message', async (msg)=>{
        console.log(`Процесс #${cluster.worker.id} запущен.`)
        let results = []

        //если на этот процесс хватило файлов
        if (msg.files) {
        //пройтись по каждому из файлов
            for(let j=0, l=msg.files.length; j<l; j++){
                let file = msg.files[j]
                //обработать файл
                let result = await processFile(file).catch(e=>console.error(e))
                if (result) {
                    //запихнуть результат в массив с ними
                    results.push(result)
                }

                if(j % 100 == 0){ //каждые 100 файлов, послать сообщение с текущим прогрессом
                    process.send({progress: Math.round(j*100/l), id:cluster.worker.id})
                }
            }
        }
        process.send({data: results, corrupted: corrupted, id:cluster.worker.id})
    })
}
