import React, { useState, useCallback } from 'react'
import {
  Avatar, Button, Form, FormItemProps, FormProps, Input, message, Tabs,
} from 'antd'
import { isMobilePhone, isEmail } from 'class-validator'
import { CopyToClipboard } from 'react-copy-to-clipboard'

import { State as UserState } from '@Src/store/user'
import { UserModel } from '@Src/models/user'
import { Storage } from '@Src/utils/storage'
import { SigninType } from '@Src/constants'
import { useTimer } from '@Src/utils/time'

import IconImg from '../../assets/icon.png'
import { Apis } from '../../services'
import Styles from './index.module.less'

interface Props {
  signinType?: SigninType;
  onSuccess?: (user: UserState) => void;
}

const { TabPane } = Tabs

function checkIsValidAuthCode(value = ''): Promise<true> {
  return new Promise((resolve, reject) => {
    if (value.length !== 4) {
      reject(new Error('请输入 4 位验证码'))
    } else {
      resolve(true)
    }
  })
}

type Rules = Required<FormItemProps<any>>['rules']

const accountRules: Rules = [
  {
    validator(_, value = '') {
      return new Promise((resolve, reject) => {
        if (isMobilePhone(value, 'zh-CN') || isEmail(value)) {
          resolve(true)
        } else {
          reject(new Error('请输入有效的手机号或邮箱'))
        }
      })
    },
  },
]

const passwordRules: Rules = [
  {
    validator(_, value = '') {
      return new Promise((resolve, reject) => {
        if (value.length < 6 || value.length > 16) {
          reject(new Error('密码长度应为 6- 16'))
        } else {
          resolve(true)
        }
      })
    },
  },
]

const authCodeRules: Rules = [
  {
    validator(_, value = '') {
      return checkIsValidAuthCode(value)
    },
  },
]

const defaultSigninType: Required<Props>['signinType'] = 'passport'

const defaultOnSuccess: Required<Props>['onSuccess'] = () => {
  message.success('登录成功, 即将跳转...')
  window.setTimeout(() => {
    window.location.href = new URL(window.location.href).searchParams.get('from') || '/'
  }, 500)
}

function signinBy({
  signinType = defaultSigninType, onSuccess = defaultOnSuccess,
}: Props) {
  // @TODO: 应该是两个 Form 共用了 form, 导致 signinType 始终没变, 有待修正
  const onFinish: FormProps['onFinish'] = ({ account, password, authCode }) => {
    Apis.signin({
      account,
      code: signinType === 'passport' ? password : authCode,
      signinType,
      accountType: isEmail(account) ? 'email' : 'phone',
    })
      .then((res) => {
        Storage.set('Authorization', `Bearer ${res.token}`)
        UserModel.setLocalUser(res.id, res)
        onSuccess(UserModel.getAllLocalUsers()[res.id])
      })
      .catch((err) => {
        message.error(err.message)
      })
  }
  return onFinish
}

export function SigninBox({
  signinType: initSigninType,
  onSuccess,
}: Props) {
  const [form] = Form.useForm()
  const [signinType, setSigninType] = useState((): SigninType => {
    if (initSigninType) {
      return initSigninType
    }
    const localUsers = Object.values(UserModel.getAllLocalUsers())
    if (localUsers.length > 0) {
      return 'passport'
    }
    // 本地无用户时默认返回验证码登录
    return 'authCode'
  })
  const { duration, resetTimer } = useTimer()

  const onFetchAuthCode = useCallback(async (account = '') => {
    try {
      await form.validateFields(['account'])
    } catch (error) {
      return
    }
    resetTimer({
      target: Date.now() + 60000,
      throttleMs: 1000,
      type: 'COUNT_TO',
    })
    try {
      const authCode = await Apis.getAuthCode({
        account,
        accountType: isEmail(account) ? 'email' : 'phone',
        codeType: 'signin',
      })
      const key = 'unique_key_for_auth_code_copied'
      const geneMessage = (code: string, copied = false) => (<>
        您的验证码为 {authCode}{' '}
        <CopyToClipboard text={authCode}
          onCopy={() => {
            message.success({
              key,
              content: geneMessage(code, true),
              duration: 2,
            })
          }}
        >
          <Button>
            {copied ? '已复制' : '点击复制'}
          </Button>
        </CopyToClipboard>
      </>)
      message.info({
        key,
        content: geneMessage(authCode),
        duration: 3,
      })
    } catch (err) {
      message.error(err.message)
    }
  }, [form, resetTimer])

  return <div className={Styles.container}>
    <div className={Styles.header}>
      <Avatar src={IconImg} shape='square' alt={process.env.APP_NAME} /> 登录 {process.env.APP_NAME}
    </div>

    <div className={Styles.body}>
      <Tabs activeKey={signinType} onChange={(key) => setSigninType(key as SigninType)}>
        <TabPane key='passport' tab='密码登录'>
          <Form
            // @TODO: 两个 <Form /> 不能用同一个 form, 否则会导致上传时
            form={form}
            onFinish={signinBy({
              signinType: 'passport',
              onSuccess,
            })}
            validateTrigger={'onBlur'}
          >
            <Form.Item
              name='account'
              required
              rules={accountRules}
            >
              <Input allowClear placeholder='手机号或邮箱' />
            </Form.Item>
            <Form.Item
              name='passport'
              required
              rules={passwordRules}
            >
              <Input type='password' allowClear placeholder='密码(6-16位英文+数字)' />
            </Form.Item>
            <Form.Item>
              <Button
                block
                type='primary'
                htmlType='submit'
              >
                登录
              </Button>
            </Form.Item>
          </Form>
        </TabPane>

        <TabPane key='authCode' tab='验证码登录/注册'>
          <Form
            form={form}
            onFinish={signinBy({
              signinType: 'authCode',
              onSuccess,
            })}
            validateTrigger={'onBlur'}
          >
            <Form.Item
              name='account'
              required
              rules={accountRules}
            >
              <Input.Search
                placeholder='手机号或邮箱'
                allowClear
                enterButton={duration > 0 ? `${Math.round(duration / 1000)} s 后重试` : '获取验证码'}
                loading={duration > 0}
                onSearch={onFetchAuthCode}
                onPressEnter={(e) => {
                  e.stopPropagation()
                }}
              />
            </Form.Item>
            <Form.Item
              name='authCode'
              required
              rules={authCodeRules}
            >
              <Input allowClear placeholder='验证码(4 位)' />
            </Form.Item>
            <p className={Styles.notice}>未注册用户将自动注册</p>
            <p className={Styles.notice}>(本网站暂未接入验证码服务, 所以你点击获取验证码, 将会直接弹窗告诉你, 你再填入就可以了)</p>
            <Form.Item>
              <Button
                block
                type='primary'
                htmlType='submit'
              >
                登录/注册
              </Button>
            </Form.Item>
          </Form>
        </TabPane>

        <TabPane key='qrcode' tab='扫码登录' disabled>
          暂不支持扫码登录
        </TabPane>
      </Tabs>
    </div>

    <div className='body'></div>
  </div>
}
